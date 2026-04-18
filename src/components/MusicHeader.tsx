'use client';

/**
 * MusicHeader — compact draggable title bar for WynAI Music desktop app.
 *
 * Features:
 * - data-tauri-drag-region → window dragging
 * - "Keep WynAI Music free ❤️" label + Buy us a coffee ☕ button (opens donate modal)
 * - Language toggle (VI/EN)
 * - Login button (Google OAuth via system browser in Tauri, or popup on web)
 * - User avatar + name when logged in
 * - Theme toggle (dark/light)
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { LogIn, LogOut, Globe, Sun, Moon, User, Heart, Copy, Check, X } from 'lucide-react';
import { useWordaiAuth } from '@/contexts/WordaiAuthContext';
import { useTheme, useLanguage } from '@/contexts/AppContext';

function t(vi: string, en: string, isVi: boolean) {
    return isVi ? vi : en;
}

// ─── Donate Modal ─────────────────────────────────────────────────────────────

type DonateTab = 'vnd' | 'usdt';

const DONATE_BANK_INFO = {
    bank: 'MB Bank',
    accountNumber: '378686686',
    accountName: 'Le Huy Tien Hoi',
};
const DONATE_USDT_ADDRESS = '0xbab94F5bF90550c9f0147fffae8A1EF006b85a07';

function DonateModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { isDark } = useTheme();
    const { isVietnamese } = useLanguage();
    const [activeTab, setActiveTab] = useState<DonateTab>('vnd');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    if (!isOpen || typeof document === 'undefined') return null;

    const handleCopy = async (value: string, key: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedKey(key);
            window.setTimeout(() => setCopiedKey(c => (c === key ? null : c)), 1500);
        } catch { setCopiedKey(null); }
    };

    const tabCls = (tab: DonateTab) =>
        `flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${activeTab === tab
            ? (isDark ? 'bg-white text-black' : 'bg-gray-900 text-white')
            : (isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}`;

    const CopyBtn = ({ value, key: k }: { value: string; key: string }) => (
        <button
            type="button"
            onClick={() => handleCopy(value, k)}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-all ${isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
            {copiedKey === k ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedKey === k ? (isVietnamese ? 'Đã chép' : 'Copied') : (isVietnamese ? 'Sao chép' : 'Copy')}
        </button>
    );

    const modal = (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className={`relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
                <div className={`flex-shrink-0 border-b rounded-t-2xl p-6 flex items-center justify-between ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                    <div>
                        <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {isVietnamese ? 'Hỗ trợ WynAI Music' : 'Support WynAI Music'}
                        </h2>
                        <p className={`mt-1 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {isVietnamese ? 'Cảm ơn bạn đã giữ WynAI Music miễn phí cho mọi người ❤️' : 'Thank you for keeping WynAI Music free for everyone ❤️'}
                        </p>
                    </div>
                    <button onClick={onClose} className={`transition-colors ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`}>
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className={`rounded-2xl border p-4 ${isDark ? 'border-red-500/30 bg-red-500/10' : 'border-red-200 bg-red-50'}`}>
                        <div className="flex items-center gap-2">
                            <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                            <p className={`text-sm font-medium ${isDark ? 'text-red-100' : 'text-red-700'}`}>
                                {isVietnamese ? 'Donate qua VND hoặc USDT (BEP20).' : 'Donate via VND or USDT (BEP20).'}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setActiveTab('vnd')} className={tabCls('vnd')}>VND</button>
                        <button type="button" onClick={() => setActiveTab('usdt')} className={tabCls('usdt')}>USDT</button>
                    </div>
                    {activeTab === 'vnd' ? (
                        <div className={`rounded-2xl border p-5 space-y-4 ${isDark ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
                            <div>
                                <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Bank</p>
                                <p className={`mt-1 text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{DONATE_BANK_INFO.bank}</p>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{isVietnamese ? 'Số tài khoản' : 'Account Number'}</p>
                                    <p className={`mt-1 text-lg font-semibold tracking-wide ${isDark ? 'text-white' : 'text-gray-900'}`}>{DONATE_BANK_INFO.accountNumber}</p>
                                </div>
                                <CopyBtn value={DONATE_BANK_INFO.accountNumber} key="bank-account" />
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{isVietnamese ? 'Chủ tài khoản' : 'Account Name'}</p>
                                    <p className={`mt-1 text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{DONATE_BANK_INFO.accountName}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className={`rounded-2xl border p-5 space-y-4 ${isDark ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>USDT (BEP20)</p>
                                    <p className={`mt-1 text-sm font-mono break-all ${isDark ? 'text-white' : 'text-gray-900'}`}>{DONATE_USDT_ADDRESS}</p>
                                </div>
                                <CopyBtn value={DONATE_USDT_ADDRESS} key="usdt-address" />
                            </div>
                        </div>
                    )}
                </div>
                <div className={`flex-shrink-0 border-t rounded-b-2xl p-4 flex justify-end ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                    <button onClick={onClose} className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${isDark ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                        {isVietnamese ? 'Đóng' : 'Close'}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}

// ─── Header ───────────────────────────────────────────────────────────────────

export default function MusicHeader() {
    const { user, isLoading, signIn, signOut } = useWordaiAuth();
    const { isDark, toggleTheme } = useTheme();
    const { isVietnamese, toggleLanguage } = useLanguage();
    const [signingIn, setSigningIn] = useState(false);
    const [donateOpen, setDonateOpen] = useState(false);

    const handleLogin = async () => {
        setSigningIn(true);
        try {
            await signIn();
        } finally {
            setSigningIn(false);
        }
    };

    return (
        <>
            <DonateModal isOpen={donateOpen} onClose={() => setDonateOpen(false)} />
            <header
                data-tauri-drag-region
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
                onMouseDown={async (e) => {
                    if (e.button !== 0) return;
                    if ((e.target as HTMLElement).closest('button,a,input,select')) return;
                    try {
                        const { getCurrentWindow } = await import('@tauri-apps/api/window');
                        await getCurrentWindow().startDragging();
                    } catch { /* web fallback: handled by WebkitAppRegion */ }
                }}
                className="flex-shrink-0 flex items-center justify-between pl-[72px] pr-4 h-11 bg-black/40 border-b border-white/5 select-none"
            >
                {/* Left: free label + coffee button */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-white/60 hidden sm:block">Keep WynAI Music free</span>
                    <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400 flex-shrink-0" />
                    <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={() => setDonateOpen(true)}
                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium hover:bg-amber-500/25 transition-colors"
                        title={t('Ủng hộ WynAI Music', 'Buy us a coffee', isVietnamese)}
                    >
                        ☕ {t('Ủng hộ', 'Support', isVietnamese)}
                    </button>
                </div>

                {/* Right: controls */}
                <div className="flex items-center gap-2">
                    {/* Language toggle */}
                    <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={toggleLanguage}
                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        title="Toggle language"
                    >
                        <Globe className="w-3.5 h-3.5" />
                        <span>{isVietnamese ? 'VI' : 'EN'}</span>
                    </button>

                    {/* Theme toggle */}
                    <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={toggleTheme}
                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
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
                                onMouseDown={e => e.stopPropagation()}
                                onClick={() => signOut()}
                                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                                className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-white/10 transition-colors"
                                title={t('Đăng xuất', 'Sign out', isVietnamese)}
                            >
                                <LogOut className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ) : (
                        <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={handleLogin}
                            disabled={signingIn}
                            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors active:scale-95"
                        >
                            <LogIn className="w-3.5 h-3.5" />
                            {signingIn
                                ? t('Đang đăng nhập...', 'Signing in...', isVietnamese)
                                : t('Đăng nhập', 'Login', isVietnamese)}
                        </button>
                    )}
                </div>
            </header>
        </>
    );
}
