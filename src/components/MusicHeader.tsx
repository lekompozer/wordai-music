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

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LogIn, LogOut, Globe, User, Heart, Copy, Check, X, Palette, Download, RefreshCw } from 'lucide-react';
import { useWordaiAuth } from '@/contexts/WordaiAuthContext';
import { useTheme, useLanguage } from '@/contexts/AppContext';
import { MUSIC_ACCENT_THEMES } from '@/lib/musicThemes';

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

const isTauriDesktop = () => typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).__TAURI_DESKTOP__;

// ─── Header ───────────────────────────────────────────────────────────────────

export default function MusicHeader() {
    const { user, isLoading, signIn, signOut } = useWordaiAuth();
    const { isDark, accentIndex, setAccentIndex } = useTheme();
    const { isVietnamese, toggleLanguage } = useLanguage();
    const [signingIn, setSigningIn] = useState(false);
    const [avatarError, setAvatarError] = useState(false);
    const [donateOpen, setDonateOpen] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    // ── Auto-update state ──────────────────────────────────────────────────
    type UpdateStatus = 'checking' | 'available' | 'upToDate' | 'error';
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('checking');
    const [updateVersion, setUpdateVersion] = useState<string>('');
    const [installing, setInstalling] = useState(false);

    useEffect(() => {
        if (!isTauriDesktop()) { setUpdateStatus('upToDate'); return; }
        (async () => {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                const result = await invoke<{ available: boolean; version?: string }>('check_for_updates');
                if (result.available && result.version) {
                    setUpdateVersion(result.version);
                    setUpdateStatus('available');
                } else {
                    setUpdateStatus('upToDate');
                }
            } catch {
                setUpdateStatus('upToDate'); // fail silently — don't block the UI
            }
        })();
    }, []);

    const handleInstallUpdate = async () => {
        if (installing) return;
        setInstalling(true);
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('download_and_install_update');
            // app.restart() is called from Rust — this line won't be reached
        } catch (e) {
            console.error('Update install failed:', e);
            setInstalling(false);
        }
    };

    useEffect(() => {
        if (!pickerOpen) return;
        const handler = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setPickerOpen(false);
            }
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [pickerOpen]);

    const handleLogin = async () => {
        setSigningIn(true);
        setAvatarError(false);
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
                {/* Left: title / branding — intentionally empty (drag region) */}
                <div />

                {/* Right: controls */}
                <div className="flex items-center gap-2">
                    {/* Upgrade button — shown when update available (active) or already latest (dimmed) */}
                    {updateStatus !== 'checking' && (
                        <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={updateStatus === 'available' && !installing ? handleInstallUpdate : undefined}
                            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all select-none
                                ${updateStatus === 'available' && !installing
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                                    : installing
                                        ? 'bg-emerald-600/60 text-white cursor-default'
                                        : 'bg-white/5 text-white/30 cursor-default'}`}
                            title={updateStatus === 'available' ? `Click to upgrade to v${updateVersion}` : isVietnamese ? 'Đang dùng bản mới nhất' : 'Already up to date'}
                        >
                            {installing
                                ? <><RefreshCw className="w-3 h-3 animate-spin" /><span>{isVietnamese ? 'Đang cài...' : 'Updating...'}</span></>
                                : updateStatus === 'available'
                                    ? <><Download className="w-3 h-3" /><span>v{updateVersion}</span></>
                                    : <span>{isVietnamese ? 'Mới nhất' : 'Up to date'}</span>
                            }
                        </button>
                    )}

                    {/* Keep free label + Support Us button */}
                    <span className="text-xs text-white/50 hidden sm:block select-none">Keep WynAI Music free</span>
                    <Heart className="w-3 h-3 text-red-400 fill-red-400 flex-shrink-0" />
                    <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={() => setDonateOpen(true)}
                        style={{ WebkitAppRegion: 'no-drag', background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)' } as React.CSSProperties}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-white text-xs font-semibold transition-opacity hover:opacity-90"
                    >
                        Support Us
                    </button>

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

                    {/* Accent color picker (replaces dark/light toggle) */}
                    <div className="relative" ref={pickerRef}>
                        <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => setPickerOpen(v => !v)}
                            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            title="Choose accent color"
                        >
                            <Palette className="w-3.5 h-3.5" />
                        </button>
                        {pickerOpen && (
                            <div
                                className="absolute right-0 top-8 z-[9999] p-2 rounded-xl border border-white/15 shadow-2xl"
                                style={{ background: 'rgba(8,12,28,0.96)', backdropFilter: 'blur(16px)', width: 140 }}
                            >
                                <p className="text-[10px] text-white/40 mb-2 px-0.5">{isVietnamese ? 'Màu sidebar' : 'Sidebar color'}</p>
                                <div className="grid grid-cols-6 gap-1.5">
                                    {MUSIC_ACCENT_THEMES.map((theme, i) => (
                                        <button
                                            key={i}
                                            onMouseDown={e => e.stopPropagation()}
                                            onClick={() => { setAccentIndex(accentIndex === i ? null : i); setPickerOpen(false); }}
                                            className="w-5 h-5 rounded-full transition-transform hover:scale-125 focus:outline-none"
                                            style={{
                                                background: theme.accent,
                                                boxShadow: accentIndex === i ? `0 0 0 2px white, 0 0 0 3px ${theme.accent}` : undefined,
                                            }}
                                            title={`${theme.name}${accentIndex === null && i === 0 ? ' (auto)' : ''}`}
                                        />
                                    ))}
                                </div>
                                {accentIndex !== null && (
                                    <button
                                        onMouseDown={e => e.stopPropagation()}
                                        onClick={() => { setAccentIndex(null); setPickerOpen(false); }}
                                        className="mt-2 w-full text-[10px] text-white/40 hover:text-white/70 transition-colors text-center"
                                    >
                                        {isVietnamese ? '↺ Tự động đổi màu' : '↺ Auto-rotate'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Auth */}
                    {isLoading ? (
                        <div className="w-6 h-6 rounded-full bg-white/10 animate-pulse" />
                    ) : user ? (
                        <div className="flex items-center gap-2">
                            {user.photoURL && !avatarError ? (
                                <img
                                    src={user.photoURL}
                                    alt={user.displayName ?? 'User'}
                                    className="w-6 h-6 rounded-full object-cover border border-white/20"
                                    onError={() => setAvatarError(true)}
                                />
                            ) : (
                                <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
                                    <span className="text-xs font-semibold text-white">
                                        {(user.displayName ?? user.email ?? 'U')[0].toUpperCase()}
                                    </span>
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
