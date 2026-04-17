'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, signInWithPopup, signInWithCredential, GoogleAuthProvider, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { wordaiAuth, wordaiGoogleProvider, persistenceReady } from '@/lib/wordai-firebase';

// Detect if running inside Tauri Desktop app
// Tauri injects window.__TAURI_DESKTOP__ = true via initialization_script
// Also check __TAURI_INTERNALS__ as a fallback (Tauri v2 injects this natively)
const isTauriDesktop = (): boolean => {
    if (typeof window === 'undefined') return false;
    const w = window as any;
    return !!(w.__TAURI_DESKTOP__ || w.__TAURI_INTERNALS__);
};

// Detect if running inside Capacitor native app (Android / iOS)
// Capacitor injects window.Capacitor and sets Capacitor.isNativePlatform() = true
const isCapacitorNative = (): boolean => {
    if (typeof window === 'undefined') return false;
    const cap = (window as any).Capacitor;
    return !!(cap && cap.isNativePlatform && cap.isNativePlatform());
};

interface WordaiAuthContextType {
    user: User | null;
    isInitialized: boolean;
    isLoading: boolean;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
    getValidToken: () => Promise<string>; // Get fresh token
}

const WordaiAuthContext = createContext<WordaiAuthContextType | undefined>(undefined);

export function WordaiAuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(wordaiAuth, (user) => {
            setUser(user);
            setIsInitialized(true);
        });

        // Desktop: listen for Google OAuth result
        // Method A (Primary): window CustomEvent dispatched via Rust win.eval() — works even
        //   if @tauri-apps/api IPC bridge is unavailable for external URLs.
        // Method B (Fallback): Tauri event via @tauri-apps/api/event listen()
        let unlisten: (() => void) | undefined;
        let authHandled = false; // prevent double sign-in if both methods fire

        const handleAuthPayload = async (payload: { id_token: string; access_token: string; email: string }) => {
            if (authHandled) {
                console.log('⏭️ [Desktop] Auth already handled, skipping duplicate');
                return;
            }
            authHandled = true;
            try {
                console.log('🖥️ [Desktop] Signing in with credential for:', payload.email);
                await persistenceReady;
                const credential = GoogleAuthProvider.credential(
                    payload.id_token,
                    payload.access_token
                );
                const result = await signInWithCredential(wordaiAuth, credential);
                console.log('✅ [Desktop] signInWithCredential success:', result.user.email);
                // Store success in localStorage so hub page can read it as fallback
                localStorage.setItem('__wordai_auth_ok', result.user.email || '1');
                localStorage.removeItem('__wordai_auth_error');
                setUser(result.user);
                setIsLoading(false);
            } catch (err: any) {
                authHandled = false; // allow retry
                const msg = err?.message || err?.code || String(err);
                console.error('❌ [Desktop] signInWithCredential failed:', msg);
                // Store error in localStorage (WKWebView often blocks alert())
                localStorage.setItem('__wordai_auth_error', msg);
                // Try alert anyway — may work in some WKWebView configurations
                try { alert(`Đăng nhập thất bại!\n\nLỗi: ${msg}\n\nVui lòng thử lại.`); } catch (_) { }
                setIsLoading(false);
            }
        };

        if (isTauriDesktop()) {
            // Method A: window event dispatched via win.eval() from Rust (most reliable)
            const onWindowAuthReady = (e: Event) => {
                const payload = (e as CustomEvent).detail as { id_token: string; access_token: string; email: string };
                console.log('🖥️ [Desktop] window wordai-auth-ready received (eval path):', payload?.email);
                handleAuthPayload(payload);
            };
            const onWindowAuthError = (e: Event) => {
                const errMsg = (e as CustomEvent).detail as string;
                console.error('❌ [Desktop] window wordai-auth-error received:', errMsg);
                localStorage.setItem('__wordai_auth_error', errMsg);
                setIsLoading(false);
            };
            window.addEventListener('wordai-auth-ready', onWindowAuthReady);
            window.addEventListener('wordai-auth-error', onWindowAuthError);

            // Method B (Tauri event listen) intentionally REMOVED.
            // listen() from @tauri-apps/api/event fires on EVERY page load (global provider)
            // and throws "plugin:event|listen not allowed by ACL" which corrupts the IPC bridge.
            // Method A (window CustomEvent via Rust win.eval()) is sufficient and permission-free.

            // Cleanup: remove window event listeners on unmount
            unlisten = () => {
                window.removeEventListener('wordai-auth-ready', onWindowAuthReady);
                window.removeEventListener('wordai-auth-error', onWindowAuthError);
            };
        }

        // Token refresh interval - refresh every 50 minutes (token expires in 1 hour)
        const tokenRefreshInterval = setInterval(async () => {
            if (wordaiAuth.currentUser) {
                try {
                    await wordaiAuth.currentUser.getIdToken(true);
                } catch (error) {
                    console.error('❌ Auto token refresh failed:', error);
                }
            }
        }, 50 * 60 * 1000);

        return () => {
            unsubscribe();
            clearInterval(tokenRefreshInterval);
            unlisten?.();
        };
    }, []);

    const signIn = async () => {
        setIsLoading(true);
        try {
            const isDesktop = isTauriDesktop();
            console.log('🔐 signIn called. isTauriDesktop:', isDesktop,
                '| __TAURI_DESKTOP__:', !!(window as any).__TAURI_DESKTOP__,
                '| __TAURI_INTERNALS__:', !!(window as any).__TAURI_INTERNALS__);

            if (isDesktop) {
                // Desktop: open system browser (Safari/Chrome) with PKCE OAuth
                // Rust handles the callback via wordai://auth/callback deep-link
                // then emits 'google-auth-result' → useEffect listener above signs in
                console.log('🖥️ Desktop path: invoking open_google_auth via Tauri');
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    await invoke('open_google_auth');
                    console.log('✅ open_google_auth invoked — system browser should open');
                    // Stay in loading state until google-auth-result event fires.
                    // Safety net: auto-reset after 90s so button never spins forever
                    // (e.g. user closed browser without completing login).
                    setTimeout(() => {
                        setIsLoading((current) => {
                            if (current) {
                                console.warn('⏱ Desktop OAuth timeout — resetting loading state');
                            }
                            return false;
                        });
                    }, 90_000);
                    return;
                } catch (invokeError: any) {
                    console.error('❌ invoke open_google_auth failed:', invokeError);
                    alert(`Lỗi mở trình duyệt:\n${invokeError?.message || String(invokeError)}\n\nKiểm tra: Tauri capabilities có shell:allow-open không?`);
                    setIsLoading(false);
                    return;
                }
            }

            // Capacitor Android/iOS: use native Google Sign-In
            if (isCapacitorNative()) {
                console.log('📱 Capacitor native path: using FirebaseAuthentication.signInWithGoogle');
                try {
                    // @capacitor-firebase/authentication is not installed in wordai-music (Tauri-only app).
                    // This code path is unreachable here (isCapacitorNative() is always false).
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const FirebaseAuthentication = await (async (): Promise<any> => { throw new Error('Capacitor not available'); })();
                    void FirebaseAuthentication;
                    const result = await FirebaseAuthentication.signInWithGoogle();
                    if (!result.credential?.idToken) throw new Error('No idToken from native Google Auth');
                    const credential = GoogleAuthProvider.credential(
                        result.credential.idToken,
                        result.credential.accessToken ?? undefined,
                    );
                    await persistenceReady;
                    const fbResult = await signInWithCredential(wordaiAuth, credential);
                    console.log('✅ [Capacitor] signInWithCredential success:', fbResult.user.email);
                    setUser(fbResult.user);
                    return;
                } catch (capErr: any) {
                    console.error('❌ [Capacitor] Native Google Auth failed:', capErr);
                    alert(`Đăng nhập thất bại: ${capErr?.message || String(capErr)}`);
                    return;
                }
            }

            // Web: use popup as normal
            console.log('🌐 Web path: using signInWithPopup');
            const result = await signInWithPopup(wordaiAuth, wordaiGoogleProvider);
            console.log('✅ Sign-in successful:', result.user);
            setUser(result.user);
        } catch (error: any) {
            console.error('❌ Sign-in failed:', error);
            let errorMessage = 'Đăng nhập thất bại';
            if (error.code) {
                switch (error.code) {
                    case 'auth/configuration-not-found':
                        errorMessage = '❌ Firebase chưa được cấu hình Google Authentication.';
                        break;
                    case 'auth/popup-blocked':
                        errorMessage = 'Popup bị chặn. Vui lòng cho phép popup và thử lại.';
                        break;
                    case 'auth/popup-closed-by-user':
                    case 'auth/cancelled-popup-request':
                        errorMessage = 'Đăng nhập bị hủy.';
                        break;
                    case 'auth/unauthorized-domain':
                        errorMessage = 'Domain không được ủy quyền trong Firebase Console.';
                        break;
                    default:
                        errorMessage = `Lỗi: ${error.code} — ${error.message}`;
                }
            } else {
                errorMessage = `Lỗi: ${error?.message || String(error)}`;
            }
            alert(errorMessage);
            throw error;
        } finally {
            // Tauri keeps loading=true until the OAuth event fires (async via system browser)
            // Capacitor and Web both complete synchronously — safe to reset immediately
            if (!isTauriDesktop()) {
                setIsLoading(false);
            }
        }
    };

    const signOut = async () => {
        setIsLoading(true);
        try {
            await firebaseSignOut(wordaiAuth);
            setUser(null);
        } catch (error) {
            console.error('Sign out failed:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const refreshProfile = async () => {
        console.log('Refreshing profile...');
    };

    /**
     * Get valid Firebase ID token - automatically refreshes if expired
     */
    const getValidToken = async (): Promise<string> => {
        if (!wordaiAuth.currentUser) {
            throw new Error('User not authenticated');
        }

        try {
            // Force refresh token to ensure it's valid
            const token = await wordaiAuth.currentUser.getIdToken(true);
            return token;
        } catch (error) {
            console.error('❌ Failed to get valid token:', error);
            throw new Error('Failed to refresh authentication token');
        }
    };

    const value = {
        user,
        isInitialized,
        isLoading,
        signIn,
        signOut,
        refreshProfile,
        getValidToken
    };

    return (
        <WordaiAuthContext.Provider value={value}>
            {children}
        </WordaiAuthContext.Provider>
    );
}

export function useWordaiAuth() {
    const context = useContext(WordaiAuthContext);
    if (context === undefined) {
        throw new Error('useWordaiAuth must be used within a WordaiAuthProvider');
    }
    return context;
}
