'use client';

/**
 * /desktop-auth — Tauri Desktop OAuth callback handler
 *
 * After Google OAuth success, Rust calls win.eval() to navigate WKWebView here:
 *   tauri://localhost/desktop-auth#id_token=...&access_token=...&email=...
 *
 * This page reads tokens from the URL hash, calls signInWithCredential,
 * then redirects to / (music player). If it fails, shows the error message.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { wordaiAuth, persistenceReady } from '@/lib/wordai-firebase';

type Status = 'loading' | 'success' | 'error';

export default function DesktopAuthPage() {
    const router = useRouter();
    const [status, setStatus] = useState<Status>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const [email, setEmail] = useState('');

    useEffect(() => {
        (async () => {
            const hash = window.location.hash.slice(1);
            if (!hash) {
                router.replace('/');
                return;
            }

            const params = new URLSearchParams(hash);
            const id_token = params.get('id_token');
            const access_token = params.get('access_token');
            const emailParam = params.get('email') || '';
            const errorParam = params.get('error');

            if (errorParam) {
                setErrorMsg(decodeURIComponent(errorParam));
                setStatus('error');
                return;
            }

            setEmail(emailParam);

            if (!id_token || !access_token) {
                setErrorMsg('Missing id_token or access_token in URL hash');
                setStatus('error');
                return;
            }

            // Clear tokens from URL immediately
            window.history.replaceState(null, '', '/desktop-auth');

            try {
                await persistenceReady;
                const credential = GoogleAuthProvider.credential(id_token, access_token);
                const result = await signInWithCredential(wordaiAuth, credential);
                console.log('✅ [desktop-auth] signInWithCredential success:', result.user.email);
                setStatus('success');
                setTimeout(() => {
                    router.replace('/');
                }, 800);
            } catch (err: unknown) {
                const msg = (err as Error)?.message || String(err);
                console.error('❌ [desktop-auth] signInWithCredential failed:', msg);
                setErrorMsg(msg);
                setStatus('error');
            }
        })();
    }, [router]);

    return (
        <div style={{
            minHeight: '100vh',
            background: '#06060f',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            color: '#fff',
        }}>
            {status === 'loading' && (
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: '50%',
                        border: '3px solid #6366f1', borderTopColor: 'transparent',
                        animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
                    }} />
                    <h2 style={{ color: '#6366f1', margin: '0 0 8px' }}>Đang đăng nhập...</h2>
                    <p style={{ color: '#9ca3af', margin: 0 }}>
                        {email ? `Tài khoản: ${email}` : 'Đang xử lý...'}
                    </p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            {status === 'success' && (
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                    <h2 style={{ color: '#6366f1', margin: '0 0 8px' }}>Đăng nhập thành công!</h2>
                    <p style={{ color: '#9ca3af', margin: 0 }}>Đang chuyển hướng về WynAI Music...</p>
                </div>
            )}

            {status === 'error' && (
                <div style={{ textAlign: 'center', maxWidth: 480, padding: '0 24px' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
                    <h2 style={{ color: '#ef4444', margin: '0 0 12px' }}>Đăng nhập thất bại</h2>
                    <pre style={{
                        background: '#1f2937', padding: '12px 16px', borderRadius: 8,
                        color: '#fca5a5', fontSize: 12, textAlign: 'left',
                        overflowWrap: 'break-word', whiteSpace: 'pre-wrap',
                    }}>{errorMsg}</pre>
                    <button
                        onClick={() => router.replace('/')}
                        style={{
                            marginTop: 16, padding: '10px 24px', background: '#6366f1',
                            color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
                            fontSize: 14, fontWeight: 600,
                        }}
                    >
                        Về trang chủ
                    </button>
                </div>
            )}
        </div>
    );
}
