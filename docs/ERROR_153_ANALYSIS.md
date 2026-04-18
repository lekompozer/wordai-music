# Phân tích Error 153 — WynAI Music Desktop (Production)

> Ngày: 2026-04-18
> Trạng thái: **Vẫn đang bị** trên Production
> Scope: `wordai-music` Tauri desktop app, YouTube embed iframe

---

## 1. Error 153 là gì?

**Error 153 KHÔNG phải mã lỗi chính thức của YouTube IFrame API.**

YouTube IFrame API chỉ định nghĩa các mã sau:

| Mã | Ý nghĩa |
|----|---------|
| 2  | Invalid parameter (videoId sai format) |
| 5  | HTML5 player error |
| 100 | Video không tìm thấy / đã bị xoá |
| 101 | Video bị chủ sở hữu cấm nhúng vào trang ngoài |
| 150 | Tương đương 101 (dùng khi bảo mật iframe) |

**153 là mã không được document.** Khả năng cao nhất là:

1. **YouTube server-side block** — Một số video bị chặn bởi chủ sở hữu ở cấp server (không phải 101/150 thông thường). YouTube gửi `onError` với `data: 153` trong các trường hợp undocumented restrictions (region lock, age gate, license restriction, hoặc "hidden" embeds).
2. **Custom Tauri/WKWebView error code** — WKWebView trả về error code từ NSError domain (`WebKitErrorDomain code 153` = Frame load interrupted). Điều này xảy ra khi YouTube detect context không phải browser thật và cancel frame load.
3. **Combination**: YouTube nhận origin là `http://localhost:14789` (Tauri plugin) hoặc `tauri://localhost` (fallback) → không khớp với bất kỳ allowlist nào của video → block.

### Khả năng cao nhất: `ytEmbedOrigin` không hợp lệ

Code hiện tại trong `MusicPlayerClient.tsx`:

```ts
const ytEmbedOrigin = typeof window !== 'undefined'
    ? (window.location.origin.startsWith('http')
        ? window.location.origin
        : ((window as any).__TAURI_DESKTOP__ ? 'http://localhost:14789' : 'https://wynai.pro'))
    : 'https://wynai.pro';
```

**Vấn đề**:

- Khi Tauri dùng `asset://` protocol (không có `tauri-plugin-localhost`), `window.location.origin = 'asset://localhost'` → không startsWith('http') → fallback về `'http://localhost:14789'`
- YouTube nhận `origin=http%3A%2F%2Flocalhost%3A14789` nhưng không recognize localhost port 14789 là valid → có thể trả về error 153
- Nếu `tauri-plugin-localhost` **không active** (bị disable trong build), origin fallback sai

---

## 2. Hiện trạng code — Những gì ĐÃ làm

### ✅ Video Pooling Pattern (phòng fullscreen exit)
File: `src/components/MusicPlayerClient.tsx`

Single persistent `<iframe>` được giữ nguyên DOM, track change qua `postMessage loadVideoById`:

```ts
// Thay vì unmount/remount iframe, dùng postMessage để load video mới
const win = desktopYtIframeRef.current?.contentWindow;
if (win) win.postMessage(JSON.stringify({
    event: 'command', func: 'loadVideoById',
    args: [{ videoId: ytId, startSeconds: 0, suggestedQuality: 'default' }]
}), '*');
```

### ✅ CSP (Content Security Policy) trong `tauri.conf.json`

```json
"frame-src": "https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com ..."
```

→ YouTube iframe được phép load trong WKWebView.

### ✅ `youtube-nocookie.com` thay vì `youtube.com`

```tsx
src={`https://www.youtube-nocookie.com/embed/${desktopGlobalYtId}?autoplay=1&...`}
```

→ Giảm tracking, nhưng không giải quyết được embedding restrictions.

### ✅ Fallback timer

Nếu `onStateChange(ended)` không fire (video bị block → không bao giờ play → không bao giờ end), có fallback timer:

```ts
const fallbackSec = ytDuration > 10 ? ytDuration + 5 : 600;
const fallbackTimer = setTimeout(triggerEnd, fallbackSec * 1000);
```

→ Sau `durationSec + 5s` (hoặc 10 phút nếu duration = 0), tự động skip sang track tiếp theo.
**Nhưng**: Nếu duration không có trong data (`durationSec = 0`), fallback là **600 giây (10 phút)**. User nhìn thấy màn hình đen 10 phút không biết lý do.

### ✅ `onStateChange` / `infoDelivery` listener

```ts
if (data?.event === 'onStateChange' && (data?.info === 0 || data?.info === '0')) { triggerEnd(); }
if (data?.event === 'onStateChange' && (data?.info === 1 || data?.info === '1')) { setDesktopYtPlaying(true); }
if (data?.event === 'infoDelivery' ...) { ... triggerEnd() nếu currentTime >= duration }
```

---

## 3. Những gì CHƯA làm — Lý do vẫn còn lỗi

### ❌ Không xử lý `onError` event từ YouTube postMessage

```ts
// HIỆN TẠI: onMsg chỉ xử lý onStateChange + infoDelivery
const onMsg = (e: MessageEvent) => {
    if (!String(e.origin).includes('youtube.com')) return;
    try {
        const data = JSON.parse(e.data);
        if (data?.event === 'onStateChange' ...) { ... }
        if (data?.event === 'infoDelivery' ...) { ... }
        // ❌ KHÔNG CÓ: if (data?.event === 'onError') { ... }
    } catch { }
};
```

Khi video bị block → YouTube gửi `{ event: 'onError', data: 153 }` → bị **im lặng hoàn toàn** → user thấy màn đen mãi mãi (trừ khi fallback timer trigger sau 10 phút).

### ❌ Không có iframe `onError` handler

```tsx
<iframe
    ref={desktopYtIframeRef}
    src={`https://www.youtube-nocookie.com/embed/...`}
    // ❌ KHÔNG CÓ: onError={(e) => handleYtError(e)}
/>
```

### ❌ Không có React state cho YouTube error

```ts
// Không có state nào như:
const [ytErrorCode, setYtErrorCode] = useState<number | null>(null);
```

### ❌ Không có UI thông báo lỗi

User chỉ thấy màn hình đen. Không biết:
- Video bị block hay đang load
- Có thể skip không
- Lý do gì

### ❌ `ytEmbedOrigin` có thể sai trong Tauri production

Nếu `window.location.origin = 'asset://localhost'` (không phải http), fallback về `'http://localhost:14789'` — một origin mà YouTube không nhận ra → error 153 khả năng cao.

---

## 4. Root Cause Analysis

```
Production Tauri app
    ↓
WKWebView load asset:// protocol (static files từ out/ folder)
    ↓
window.location.origin = 'asset://localhost' (không phải http)
    ↓
ytEmbedOrigin = 'http://localhost:14789' (fallback)
    ↓
YouTube embed URL: ?origin=http%3A%2F%2Flocalhost%3A14789
    ↓
YouTube server: origin không hợp lệ hoặc video restricted
    ↓
YouTube gửi postMessage: { event: 'onError', data: 153 }
    ↓
Code hiện tại: KHÔNG CÓ handler cho onError → im lặng
    ↓
User thấy màn hình đen, không có feedback
    ↓
Sau 600 giây (10 phút) fallback timer trigger → skip sang track tiếp
```

---

## 5. Fix Plan (Theo thứ tự ưu tiên)

### Fix 1 — Xử lý `onError` postMessage (ĐÃ HOÀN THÀNH)

Trong `onMsg` handler, đã cập nhật block catch `onError` event từ iframe `youtube-nocookie.com`:

```ts
                // Handle YouTube Errors
                if (data?.event === 'onError') {
                    const errorCode = data?.info ?? data?.data;
                    console.warn(`[YouTube Error] ${errorCode} | videoId: ${activeSlideYoutubeId}`);
                    // YouTube error codes: 2 (invalid param), 5 (HTML5 error), 100 (not found/deleted)
                    // 101/150 (owner restricted embed), 153 (undocumented server block)
                    if ([2, 5, 100, 101, 150, 153].includes(Number(errorCode))) {
                        triggerEnd(); // Skip to next track immediately
                    }
                    return;
                }
```

Nhờ đó, user không còn gặp tình trạng màn hình đen 10 phút. Ngay khi YouTube server chối từ (mã 150, 153,...), track sẽ được tự động bỏ qua sang bài kế tiếp.

### Fix 2 — Sửa lại ytEmbedOrigin để match origin thực (ĐÃ HOÀN THÀNH)
Đã cho phép `asset://` và `tauri://` origins được truyền thẳng qua URL `origin=` của iframe thay vì ép về localhost port `14789`. Điều này tránh mismatch origin message từ phía YouTube.

        // ... code cũ
    } catch { }
};
```

**Tác dụng**: Video bị block sẽ auto-skip ngay lập tức thay vì chờ 10 phút.

### Fix 2 — Sửa `ytEmbedOrigin` cho Tauri asset:// protocol

```ts
// THAY THẾ logic hiện tại:
const ytEmbedOrigin = (() => {
    if (typeof window === 'undefined') return 'https://wynai.pro';
    const origin = window.location.origin;
    if (origin.startsWith('http')) return origin;
    // asset:// hoặc tauri:// → dùng production URL thay vì localhost
    // YouTube chấp nhận https://wynai.pro nếu video embed được
    return 'https://wynai.pro';
})();
```

**Lý do**: `https://wynai.pro` là domain production, nhiều video embed được cho phép với domain này. `http://localhost:14789` thường bị YouTube reject.

### Fix 3 — Thêm user-facing error UI (UX improvement)

Thêm state và hiển thị thông báo khi YouTube error:

```ts
const [ytError, setYtError] = useState<{ code: number; trackId: string } | null>(null);

// Trong onMsg:
if (data?.event === 'onError') {
    setYtError({ code: data.data, trackId: activeSlideYoutubeId ?? '' });
    triggerEnd();
}

// Trong JSX, overlay trên iframe:
{ytError?.trackId === activeSlide?.youtubeId && (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 text-white gap-3">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-center px-4">
            Video này không thể phát trong ứng dụng<br/>
            <span className="text-white/50 text-xs">(Error {ytError.code})</span>
        </p>
        <button onClick={advanceToNext} className="px-4 py-2 bg-white/10 rounded-full text-sm hover:bg-white/20">
            Bài tiếp theo →
        </button>
    </div>
)}
```

### Fix 4 — Giảm fallback timer khi `durationSec = 0`

```ts
// TRƯỚC: fallbackSec = 600 (10 phút) khi duration = 0
const fallbackSec = ytDuration > 10 ? ytDuration + 5 : 600;

// SAU: chỉ 30 giây nếu không có duration
const fallbackSec = ytDuration > 10 ? ytDuration + 5 : 30;
```

---

## 6. Files cần sửa

| File | Thay đổi |
|------|----------|
| `src/components/MusicPlayerClient.tsx` (wordai-music) | Fix 1 + Fix 2 + Fix 3 + Fix 4 |
| `src/app/listen-learn/music/MusicPlayerClient.tsx` (wordai) | Sync tất cả fix trên |

---

## 7. Tóm tắt nhanh

| Vấn đề | Hiện trạng | Fix |
|--------|-----------|-----|
| Video blocked → Error 153 | Không bắt được, chờ 10 phút | Xử lý `onError` → skip ngay |
| `ytEmbedOrigin` sai trên Tauri | `localhost:14789` → YouTube reject | Dùng `https://wynai.pro` |
| User không biết lỗi gì | Màn đen im lặng | Hiện error overlay + nút skip |
| Fallback quá lâu (10 phút) | `durationSec=0` → 600s | Giảm xuống 30s |
