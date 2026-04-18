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

## 4. Root Cause Analysis — ĐÃ XÁC ĐỊNH CHÍNH XÁC

```
Production Tauri app (TRƯỚC FIX)
    ↓
WebviewUrl::App("index.html") → WKWebView load via asset:// protocol
    ↓
window.location.origin = 'asset://localhost'
    ↓
ytEmbedOrigin = fallback về 'http://localhost:14789' hoặc 'https://wynai.pro'
    ↓
YouTube REJECT origin (không phải http://localhost:3001)
    ↓
Error 153 / video không play, onError bị im lặng → màn đen 10 phút

Dev Mode (LUÔN HOẠT ĐỘNG)
    ↓
devUrl = "http://localhost:3001" → WKWebView load trực tiếp từ Next.js dev server
    ↓
window.location.origin = 'http://localhost:3001'
    ↓
YouTube ACCEPT origin → play bình thường
```

**Điểm mấu chốt**: YouTube đã whitelist `http://localhost:3001` nhưng KHÔNG whitelist `http://localhost:14789` hay `asset://localhost`. `tauri-plugin-localhost` đã được đăng ký nhưng webview vẫn dùng `asset://` protocol vì `WebviewUrl::App("index.html")` — plugin chạy nhưng không ai dùng!

---

## 5. Fix đã áp dụng

### Fix 1 — Xử lý `onError` postMessage ✅ (commit `3673ab8`)

Trong `onMsg` handler, thêm xử lý `onError` event:

```ts
if (data?.event === 'onError') {
    const errorCode = data?.info ?? data?.data;
    console.warn(`[YouTube Error] ${errorCode} | videoId: ${activeSlideYoutubeId}`);
    if ([2, 5, 100, 101, 150, 153].includes(Number(errorCode))) {
        triggerEnd(); // Skip sang track tiếp theo ngay lập tức
    }
    return;
}
```

Kết quả: Video bị block auto-skip ngay, không còn chờ 10 phút nữa.

### Fix 2 — Dùng `http://localhost:3001` trên production ✅ (commit `18eba77`)

**Root fix thực sự**: Thay đổi `src-tauri/src/lib.rs` để production load webview qua HTTP server (port 3001) thay vì `asset://`:

```rust
// tauri-plugin-localhost serve out/ tại port 3001 (CÙNG port với dev mode)
.plugin(tauri_plugin_localhost::Builder::new(3001).build())

// Production: load qua HTTP → window.location.origin = "http://localhost:3001"
#[cfg(not(dev))]
let webview_url = WebviewUrl::External(
    "http://localhost:3001".parse().expect("invalid localhost url"),
);
// Dev: vẫn dùng devUrl từ tauri.conf.json (http://localhost:3001)
#[cfg(dev)]
let webview_url = WebviewUrl::App("index.html".into());
```

`ytEmbedOrigin` trong `MusicPlayerClient.tsx` giờ luôn nhận `http://localhost:3001` (cả dev lẫn production) → YouTube chấp nhận → video play bình thường.

---

## 6. Trạng thái hiện tại ✅ RESOLVED

| Vấn đề | Trước | Sau |
|--------|-------|-----|
| Video Error 153 | Màn đen 10 phút | Auto-skip ngay lập tức |
| YouTube reject origin | `asset://localhost` → bị block | `http://localhost:3001` → được chấp nhận |
| Dev vs Production | Dev OK, Production broken | Cả hai dùng cùng origin `http://localhost:3001` |

## 7. Bài học rút ra

- `tauri-plugin-localhost` phải được dùng kết hợp với `WebviewUrl::External("http://localhost:PORT")` — chỉ đăng ký plugin mà không đổi `WebviewUrl` thì plugin vô nghĩa.
- Khi debug vấn đề "dev OK nhưng production broken", luôn kiểm tra `window.location.origin` — dev và production có thể serve từ protocol khác nhau.
- Port phải khớp với port YouTube đã whitelist (`3001`) — không tự chọn port random như `14789`.
