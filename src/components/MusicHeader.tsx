'use client';

/**
 * MusicHeader — compact draggable title bar for WordAI Music desktop app.
 *
 * Features:
 * - data-tauri-drag-region → window dragging
 * - Language toggle (VI/EN)
 * - Login button (Google OAuth via system browser in Tauri, or popup on web)
 * - User avatar + name when logged in
 * - Theme toggle (dark/light)
 */

import { useState } from 'react';
import { Music2, LogIn, LogOut, Globe, Sun, Moon, User, X } from 'lucide-react';
import { useWordaiAuth } from '@/contexts/WordaiAuthContext';
import { useTheme, useLanguage } from '@/contexts/AppContext';

function t(vi: string, en: string, isVi: boolean) {
    return isVi ? vi : en;
}

export default function MusicHeader() {
    const { user, isLoading, signIn, signOut } = useWordaiAuth();
    const { isDark, toggleTheme } = useTheme();
    const { isVietnamese, toggleLanguage } = useLanguage();
    const [signingIn, setSigningIn] = useState(false);

    const handleLogin = async () => {
        setSigningIn(true);
        try {
            await signIn();
        } finally {
            setSigningIn(false);
        }
    };

    const handleClose = async () => {
        if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await getCurrentWindow().close();
        }
    };

    return (
        <header
            data-tauri-drag-region
            className="flex-shrink-0 flex items-center justify-between px-4 h-11 bg-black/40 border-b border-white/5 select-none"
        >
            {/* Left: Logo */}
            <div className="flex items-center gap-2">
                <Music2 className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-semibold text-white/90 tracking-wide">WynAI Music</span>
            </div>

            {/* Right: controls */}
            <div className="flex items-center gap-2">
                {/* Language toggle */}
                <button
                    onClick={toggleLanguage}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    title="Toggle language"
                >
                    <Globe className="w-3.5 h-3.5" />
                    <span>{isVietnamese ? 'VI' : 'EN'}</span>
                </button>

                {/* Theme toggle */}
                <button
                    onClick={toggleTheme}
                    className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    title={isDark ? 'Switch to light' : 'Switch to dark'}
                >
                    {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                </button>

                {/* Auth */}
                {isLoading ? (
                    <div className="w-6 h-6 rounded-full bg-white/10 animate-pulse" />
                ) : user ? (
                    <div className="flex items-center gap-2">
                        {user.photoURL ? (
                            <img
                                src={user.photoURL}
                                alt={user.displayName ?? 'User'}
                                className="w-6 h-6 rounded-full object-cover border border-white/20"
                            />
                        ) : (
                            <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
                                <User className="w-3.5 h-3.5 text-white" />
                            </div>
                        )}
                        <span className="text-xs text-gray-300 max-w-[100px] truncate hidden sm:block">
                            {user.displayName ?? user.email}
                        </span>
                        <button
                            onClick={() => signOut()}
                            className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-white/10 transition-colors"
                            title={t('Đăng xuất', 'Sign out', isVietnamese)}
                        >
                            <LogOut className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={handleLogin}
                        disabled={signingIn}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors active:scale-95"
                    >
                        <LogIn className="w-3.5 h-3.5" />
                        {signingIn
                            ? t('Đang đăng nhập...', 'Signing in...', isVietnamese)
                            : t('Đăng nhập', 'Login', isVietnamese)}
                    </button>
                )}

                {/* Close button (Tauri only) */}
                <button
                    onClick={handleClose}
                    className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-red-500/80 transition-colors"
                    title="Close"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        </header>
    );
}
