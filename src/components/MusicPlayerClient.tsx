'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Music2, Heart, Bookmark, BookmarkCheck, Share2,
    Volume2, VolumeX, ChevronRight, Play, Pause, Menu, Plus, X, ListMusic, Shuffle,
    Maximize2, Minimize2, HardDrive,
} from 'lucide-react';
import { useTheme, useLanguage } from '@/contexts/AppContext';
import { useWordaiAuth } from '@/contexts/WordaiAuthContext';
import MusicSidebar, { type SidebarTrack } from './MusicSidebar';
import YoutubeShortsFeedClient from './YoutubeShortsFeedClient';
import { getAudioBlob, getSessionBlob, setSessionBlob, cacheAudioBlob } from '@/lib/audioCache';
import { recordTrackPlay } from '@/services/musicService';
import {
    MUSIC_PLAYLISTS_UPDATED_EVENT,
    addTrackToMusicPlaylist,
    getMusicPlaylists,
    type MusicPlaylist,
} from '@/services/musicPlaylistService';

function t(vi: string, en: string, isVietnamese: boolean) {
    return isVietnamese ? vi : en;
}

// ─── Channel definitions ─────────────────────────────────────────────────────

const MUSIC_CHANNELS = [
    { slug: 'background-music', name: 'Background Music', label: 'm/background-music', accent: '#4f46e5' },
    { slug: 'nhacviet-tiktok', name: 'Nhạc Việt', label: 'm/nhacviet-tiktok', accent: '#0f766e' },
    { slug: 'rap-tiktok', name: 'Rap TikTok', label: 'm/rap-tiktok', accent: '#7c3aed' },
    { slug: 'nhac-soi-dong', name: 'Nhạc Sôi Động', label: 'm/nhac-soi-dong', accent: '#1d4ed8' },
    { slug: 'nhac-en-chill', name: 'Nhạc Chill', label: 'm/nhac-en-chill', accent: '#4338ca' },
] as const;

type ChannelSlug = typeof MUSIC_CHANNELS[number]['slug'] | 'playlist' | (string & {});

const PLAYLIST_META = { slug: 'playlist' as const, name: 'My Playlist', label: 'pl/playlist', accent: '#4338ca' };

type AnyChannelMeta = { slug: string; name: string; label: string; accent: string };

const TRACK_VISUAL_THEMES = [
    // 1 — Indigo
    {
        accent: '#4f46e5',
        background: 'radial-gradient(ellipse at 18% 16%, rgba(79,70,229,0.34) 0%, transparent 42%), radial-gradient(ellipse at 84% 78%, rgba(37,99,235,0.24) 0%, transparent 44%), linear-gradient(145deg, #060816 0%, #101935 52%, #050814 100%)',
    },
    // 2 — Blue
    {
        accent: '#2563eb',
        background: 'radial-gradient(ellipse at 18% 20%, rgba(37,99,235,0.34) 0%, transparent 42%), radial-gradient(ellipse at 80% 84%, rgba(14,165,233,0.22) 0%, transparent 44%), linear-gradient(145deg, #04101f 0%, #0f1f3a 52%, #050915 100%)',
    },
    // 3 — Violet
    {
        accent: '#7c3aed',
        background: 'radial-gradient(ellipse at 22% 18%, rgba(124,58,237,0.34) 0%, transparent 42%), radial-gradient(ellipse at 84% 76%, rgba(59,130,246,0.18) 0%, transparent 40%), linear-gradient(145deg, #090915 0%, #1a1433 52%, #050814 100%)',
    },
    // 4 — Teal
    {
        accent: '#0f766e',
        background: 'radial-gradient(ellipse at 20% 18%, rgba(15,118,110,0.34) 0%, transparent 42%), radial-gradient(ellipse at 82% 76%, rgba(79,70,229,0.2) 0%, transparent 44%), linear-gradient(145deg, #041111 0%, #0d2329 52%, #060814 100%)',
    },
    // 5 — Navy blue
    {
        accent: '#1d4ed8',
        background: 'radial-gradient(ellipse at 22% 22%, rgba(29,78,216,0.34) 0%, transparent 42%), radial-gradient(ellipse at 80% 78%, rgba(99,102,241,0.2) 0%, transparent 44%), linear-gradient(145deg, #040913 0%, #10203b 52%, #050814 100%)',
    },
    // 6 — Rose / Pink
    {
        accent: '#e11d48',
        background: 'radial-gradient(ellipse at 20% 16%, rgba(225,29,72,0.32) 0%, transparent 42%), radial-gradient(ellipse at 82% 78%, rgba(124,58,237,0.2) 0%, transparent 44%), linear-gradient(145deg, #150610 0%, #2a0d1a 52%, #080510 100%)',
    },
    // 7 — Orange / Amber
    {
        accent: '#ea580c',
        background: 'radial-gradient(ellipse at 20% 18%, rgba(234,88,12,0.32) 0%, transparent 42%), radial-gradient(ellipse at 80% 80%, rgba(202,138,4,0.18) 0%, transparent 44%), linear-gradient(145deg, #150904 0%, #291405 52%, #090805 100%)',
    },
    // 8 — Green / Emerald
    {
        accent: '#16a34a',
        background: 'radial-gradient(ellipse at 20% 18%, rgba(22,163,74,0.32) 0%, transparent 42%), radial-gradient(ellipse at 80% 78%, rgba(15,118,110,0.2) 0%, transparent 44%), linear-gradient(145deg, #041109 0%, #0c2214 52%, #050b07 100%)',
    },
    // 9 — Cyan / Sky
    {
        accent: '#0891b2',
        background: 'radial-gradient(ellipse at 18% 18%, rgba(8,145,178,0.32) 0%, transparent 42%), radial-gradient(ellipse at 84% 76%, rgba(37,99,235,0.2) 0%, transparent 44%), linear-gradient(145deg, #041018 0%, #0d2030 52%, #050a14 100%)',
    },
    // 10 — Fuchsia / Magenta
    {
        accent: '#a21caf',
        background: 'radial-gradient(ellipse at 22% 18%, rgba(162,28,175,0.32) 0%, transparent 42%), radial-gradient(ellipse at 80% 78%, rgba(79,70,229,0.2) 0%, transparent 44%), linear-gradient(145deg, #0f0514 0%, #200a28 52%, #09050e 100%)',
    },
    // 11 — Warm purple / Grape
    {
        accent: '#6d28d9',
        background: 'radial-gradient(ellipse at 18% 20%, rgba(109,40,217,0.34) 0%, transparent 42%), radial-gradient(ellipse at 82% 80%, rgba(162,28,175,0.18) 0%, transparent 44%), linear-gradient(145deg, #09071a 0%, #18102e 52%, #07051a 100%)',
    },
    // 12 — Slate / Cool grey
    {
        accent: '#475569',
        background: 'radial-gradient(ellipse at 20% 18%, rgba(71,85,105,0.4) 0%, transparent 42%), radial-gradient(ellipse at 80% 76%, rgba(79,70,229,0.16) 0%, transparent 44%), linear-gradient(145deg, #070b12 0%, #111927 52%, #060a10 100%)',
    },
];

// ─── Dominant colour → nearest theme ─────────────────────────────────────────

// Map an extracted [r,g,b] to one of the 12 theme accents (nearest by hue bucket)
const THEME_ACCENT_HUES: [number, number][] = [
    [247, 0],   // 1 Indigo    ~247°
    [217, 1],   // 2 Blue      ~217°
    [263, 2],   // 3 Violet    ~263°
    [174, 3],   // 4 Teal      ~174°
    [222, 4],   // 5 Navy      ~222°
    [345, 5],   // 6 Rose      ~345°
    [22, 6],   // 7 Orange    ~22°
    [142, 7],   // 8 Green     ~142°
    [192, 8],   // 9 Cyan      ~192°
    [292, 9],   // 10 Fuchsia  ~292°
    [271, 10],  // 11 Grape    ~271°
    [215, 11],  // 12 Slate    ~215°
];

function rgbToHue(r: number, g: number, b: number): number {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const d = max - min;
    if (d === 0) return 0;
    let h = 0;
    if (max === rn) h = ((gn - bn) / d + 6) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    return (h / 6) * 360;
}

function dominantHueToThemeIndex(hue: number): number {
    let best = 0, bestDist = 360;
    for (const [themeHue, idx] of THEME_ACCENT_HUES) {
        const dist = Math.min(Math.abs(hue - themeHue), 360 - Math.abs(hue - themeHue));
        if (dist < bestDist) { bestDist = dist; best = idx; }
    }
    return best;
}

/** Extract dominant hue from an image URL via canvas (returns theme index 0-11) */
async function getImageThemeIndex(thumbnailUrl: string): Promise<number | null> {
    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = thumbnailUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = 24; canvas.height = 24; // tiny sample for speed
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, 24, 24);
        const data = ctx.getImageData(0, 0, 24, 24).data;
        // Weighted average skipping near-grey pixels (saturation filter)
        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const sat = max === 0 ? 0 : (max - min) / max;
            if (sat > 0.18 && max > 30) { sumR += r; sumG += g; sumB += b; count++; }
        }
        if (count < 5) return null; // mostly grey/dark → fallback
        const hue = rgbToHue(sumR / count, sumG / count, sumB / count);
        return dominantHueToThemeIndex(hue);
    } catch { return null; }
}

function hashTrackKey(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

// coverThemeCache: thumbnailUrl → theme index (null = no cover / grey)
const coverThemeCache = new Map<string, number | null>();

function getTrackVisualTheme(track: SlideTrack, fallbackAccent: string, coverThemeIdx?: number | null) {
    // If we have a cover-derived theme index, use it
    if (coverThemeIdx != null && coverThemeIdx >= 0 && coverThemeIdx < TRACK_VISUAL_THEMES.length) {
        return TRACK_VISUAL_THEMES[coverThemeIdx]!;
    }
    const theme = TRACK_VISUAL_THEMES[hashTrackKey(`${track.id}:${track.title}:${track.artist}`) % TRACK_VISUAL_THEMES.length];
    return {
        accent: theme?.accent ?? fallbackAccent,
        background: theme?.background ?? `linear-gradient(145deg, ${fallbackAccent}22, #050814)`,
    };
}

// Shuffle localStorage key
const SHUFFLE_KEY = 'music_shuffle';
function loadShuffleState(): boolean {
    try { return localStorage.getItem(SHUFFLE_KEY) !== 'false'; } catch { return true; }
}
function saveShuffleState(v: boolean) {
    try { localStorage.setItem(SHUFFLE_KEY, v ? 'true' : 'false'); } catch { /* ignore */ }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Track {
    id: string;
    title: string;
    artist: string;
    audioUrl: string;
    durationSec: number;
    source: string;
    thumbnailUrl?: string;
    youtubeId?: string;
    tiktokId?: string;
    facebookId?: string;
    facebookIsReel?: boolean; // true = portrait reel (fbreel: prefix), false/undefined = landscape video (fb: prefix)
}

interface SlideTrack extends Track {
    channelSlug: ChannelSlug;
}

// ─── Last-played context (localStorage) ─────────────────────────────────────

const LAST_CTX_KEY = 'music_last_ctx';

type LastCtx =
    | { type: 'channel'; slug: ChannelSlug }
    | { type: 'playlist'; id: string; name: string; tracks: SidebarTrack[] };

function saveLastCtx(ctx: LastCtx) {
    try { localStorage.setItem(LAST_CTX_KEY, JSON.stringify(ctx)); } catch { /* ignore */ }
}

function loadLastCtx(): LastCtx | null {
    try {
        const raw = localStorage.getItem(LAST_CTX_KEY);
        return raw ? (JSON.parse(raw) as LastCtx) : null;
    } catch { return null; }
}

// ─── localStorage queue helpers ───────────────────────────────────────────────

function getStoredQueue(slug: string): string[] {
    try { return JSON.parse(localStorage.getItem(`mq_${slug}`) || '[]'); } catch { return []; }
}
function saveQueue(slug: string, ids: string[]) {
    try { localStorage.setItem(`mq_${slug}`, JSON.stringify(ids)); } catch { /* ignore quota errors */ }
}
function getStoredPlayed(slug: string): string[] {
    try { return JSON.parse(localStorage.getItem(`mp_${slug}`) || '[]'); } catch { return []; }
}
function addPlayed(slug: string, id: string) {
    const played = getStoredPlayed(slug);
    played.push(id);
    // Keep max 1000 to prevent unbounded growth
    try { localStorage.setItem(`mp_${slug}`, JSON.stringify(played.slice(-1000))); } catch { /* ignore quota errors */ }
}
function shuffleArr<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function popTracks(slug: string, allTracks: Track[], n: number): Track[] {
    let q = getStoredQueue(slug);

    if (q.length < n) {
        const playedSet = new Set(getStoredPlayed(slug));
        let unplayed = allTracks.filter(t => !playedSet.has(t.id));
        if (unplayed.length === 0) {
            // All played — full reset
            localStorage.removeItem(`mp_${slug}`);
            unplayed = [...allTracks];
        }
        const newBatch = shuffleArr(unplayed).map(t => t.id);
        q = [...q, ...newBatch];
        saveQueue(slug, q);
    }

    const taken = q.slice(0, n);
    saveQueue(slug, q.slice(n));
    taken.forEach(id => addPlayed(slug, id));

    const trackMap = new Map(allTracks.map(t => [t.id, t]));
    return taken.map(id => trackMap.get(id)).filter(Boolean) as Track[];
}

// ─── Liked / Saved localStorage ───────────────────────────────────────────────

function getLiked(): Set<string> {
    try { return new Set(JSON.parse(localStorage.getItem('music_liked') || '[]')); } catch { return new Set(); }
}
function getSaved(): Set<string> {
    try { return new Set(JSON.parse(localStorage.getItem('music_saved') || '[]')); } catch { return new Set(); }
}
function toggleSetStorage(key: string, id: string): Set<string> {
    const s = key === 'music_liked' ? getLiked() : getSaved();
    if (s.has(id)) s.delete(id); else s.add(id);
    localStorage.setItem(key, JSON.stringify([...s]));
    return s;
}

// ─── Audio blob URL cache (module-level, LRU, max 3) ────────────────────────
// Stores object URLs (not blobs) so the same URL is reused per track.
// Max 3 entries keeps memory usage sane on mobile.

const MAX_BLOB_CACHE = 3;
const _blobUrlCache = new Map<string, string>(); // trackId → objectURL

function getCachedBlobUrl(trackId: string): string | null {
    return _blobUrlCache.get(trackId) ?? null;
}

function storeBlobUrl(trackId: string, blob: Blob): string {
    // Revoke stale URL if re-caching same track
    if (_blobUrlCache.has(trackId)) {
        URL.revokeObjectURL(_blobUrlCache.get(trackId)!);
        _blobUrlCache.delete(trackId);
    }
    // Evict oldest when at capacity
    while (_blobUrlCache.size >= MAX_BLOB_CACHE) {
        const oldestKey = _blobUrlCache.keys().next().value as string;
        URL.revokeObjectURL(_blobUrlCache.get(oldestKey)!);
        _blobUrlCache.delete(oldestKey);
    }
    const url = URL.createObjectURL(blob);
    _blobUrlCache.set(trackId, url);
    return url;
}

// ─── Channel data cache (module-level) ───────────────────────────────────────

const channelCache: Record<string, Track[]> = {};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadChannel(slug: string): Promise<Track[]> {
    if (channelCache[slug]) return channelCache[slug];
    try {
        // Community channel: UUID → load playlist tracks from the Worker (public endpoint)
        if (UUID_RE.test(slug)) {
            const WORKER = 'https://db-wordai-community.hoangnguyen358888.workers.dev';
            const tracksRes = await fetch(`${WORKER}/api/music/channel-tracks/${slug}`);
            if (!tracksRes.ok) return [];
            const data = await tracksRes.json() as any;
            const tracks: Track[] = (data.tracks ?? []).map((t: any) => {
                const audioUrl: string = t.audioUrl ?? t.audio_url ?? '';
                const youtubeId: string | undefined = t.youtubeId ?? (audioUrl.startsWith('yt:') ? audioUrl.slice(3) : undefined);
                const tiktokId: string | undefined = t.tiktokId ?? (audioUrl.startsWith('tt:') ? audioUrl.slice(3) : undefined);
                const facebookId: string | undefined = t.facebookId ?? (audioUrl.startsWith('fbreel:') ? audioUrl.slice(7) : audioUrl.startsWith('fb:') ? audioUrl.slice(3) : undefined);
                const facebookIsReel: boolean = audioUrl.startsWith('fbreel:') || (!!(t.facebookId) && !audioUrl.startsWith('fb:'));
                return {
                    id: t.id ?? t.track_id,
                    title: t.title,
                    artist: t.artist ?? '',
                    audioUrl,
                    durationSec: t.durationSec ?? t.duration_sec ?? 0,
                    source: t.source ?? 'youtube',
                    thumbnailUrl: t.thumbnailUrl ?? t.thumbnail_url,
                    youtubeId,
                    tiktokId,
                    facebookId,
                    facebookIsReel: facebookIsReel || undefined,
                };
            });
            channelCache[slug] = tracks;
            return tracks;
        }
        const res = await fetch(`/data/music/${slug}.json`);
        if (!res.ok) return [];
        const data = await res.json();
        // Static JSON uses "coverUrl" but Track interface uses "thumbnailUrl" — normalise here
        // Also derive youtubeId/tiktokId from audioUrl prefix if not explicitly stored
        const tracks: Track[] = (data.tracks || []).map((t: Record<string, unknown>) => {
            const audioUrl = (t.audioUrl ?? '') as string;
            const youtubeId = (t.youtubeId ?? (audioUrl.startsWith('yt:') ? audioUrl.slice(3) : undefined)) as string | undefined;
            const tiktokId = (t.tiktokId ?? (audioUrl.startsWith('tt:') ? audioUrl.slice(3) : undefined)) as string | undefined;
            const facebookId = (t.facebookId ?? (audioUrl.startsWith('fbreel:') ? audioUrl.slice(7) : audioUrl.startsWith('fb:') ? audioUrl.slice(3) : undefined)) as string | undefined;
            const facebookIsReel = audioUrl.startsWith('fbreel:') ? true : undefined;
            return {
                ...t,
                thumbnailUrl: (t.thumbnailUrl ?? t.coverUrl) as string | undefined,
                youtubeId,
                tiktokId,
                facebookId,
                facebookIsReel,
            };
        });
        channelCache[slug] = tracks;
        return tracks;
    } catch { return []; }
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtCount(n: number): string {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
}

function fmtTime(sec: number): string {
    if (!sec || sec <= 0) return '';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Vinyl disc placeholder ───────────────────────────────────────────────────

function VinylDisc({ isSpinning, accent, thumbnailUrl }: { isSpinning: boolean; accent: string; thumbnailUrl?: string }) {
    return (
        <div
            className="relative w-[174px] h-[174px] md:w-52 md:h-52 rounded-full shadow-[0_0_80px_rgba(0,0,0,0.8)] flex items-center justify-center select-none overflow-hidden"
            style={{
                background: thumbnailUrl
                    ? `url(${thumbnailUrl}) center/cover no-repeat`
                    : `radial-gradient(circle at 35% 35%, #2d2d2d, #111)`,
                animation: isSpinning ? 'vinylSpin 10s linear infinite' : 'none',
                border: '3px solid rgba(255,255,255,0.08)',
                // Safari mobile: overflow-hidden + border-radius doesn't clip without this
                WebkitMaskImage: '-webkit-radial-gradient(circle, white 100%, black 100%)',
                maskImage: 'radial-gradient(circle, white 100%, black 100%)',
            }}
        >
            {/* Grooves */}
            {[60, 80, 100, 120, 140, 160, 180].map(r => (
                <div key={r} className="absolute rounded-full border border-white/[0.06]"
                    style={{ width: r, height: r }} />
            ))}
            {/* Center hole */}
            {thumbnailUrl ? (
                <div className="relative w-2.5 h-2.5 md:w-5 md:h-5 rounded-full bg-black/80 z-10" />
            ) : (
                <div className="relative w-10 h-10 md:w-20 md:h-20 rounded-full flex items-center justify-center"
                    style={{ background: `radial-gradient(circle, #1a1a1a, #0a0a0a)`, border: '2px solid rgba(255,255,255,0.1)' }}>
                    <div className="w-6 h-6 md:w-12 md:h-12 rounded-full flex items-center justify-center"
                        style={{ background: `radial-gradient(circle at 40% 40%, ${accent}40, ${accent}15)`, border: `1.5px solid ${accent}50` }}>
                        <div className="w-1.5 h-1.5 md:w-3 md:h-3 rounded-full bg-white/20" />
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Sound bars animation ─────────────────────────────────────────────────────

function SoundBars({ playing }: { playing: boolean }) {
    const heights = [4, 7, 10, 6, 9, 5, 8, 4, 6, 7, 5, 8, 4];
    return (
        <div className="flex items-end gap-[3px] h-8">
            {heights.map((h, i) => (
                <div key={i} className="w-[3px] rounded-full bg-white/50"
                    style={{
                        height: playing ? `${h * 2.5}px` : '4px',
                        transition: 'height 0.2s ease',
                        animation: playing ? `soundBar 0.6s ease-in-out ${i * 0.06}s infinite alternate` : 'none',
                    }} />
            ))}
        </div>
    );
}

// ─── Real-time audio visualizer (audioMotion-analyzer) ───────────────────────

// Single persistent AudioContext shared across all AudioMotionAnalyzer instances.
// Never destroyed — avoids the "new suspended context per track" silence bug on mobile/iOS.
// Creating a new AudioContext for each track means it starts SUSPENDED; even calling
// .resume() after the async import may fail because we're outside the user-gesture stack.
let _sharedAudioCtx: AudioContext | null = null;

function getSharedAudioCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
        if (!_sharedAudioCtx || _sharedAudioCtx.state === 'closed') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
            if (!Ctor) return null;
            _sharedAudioCtx = new Ctor() as AudioContext;
        }
        return _sharedAudioCtx;
    } catch { return null; }
}

/** Returns existing AudioContext without creating one. Safe to call before user gesture. */
function getExistingAudioCtx(): AudioContext | null {
    // Clear stale closed context so subsequent getSharedAudioCtx() creates a fresh one
    if (_sharedAudioCtx?.state === 'closed') {
        _sharedAudioCtx = null;
    }
    return _sharedAudioCtx;
}

/** Silent oscillator node to keep AudioContext alive in WKWebView (prevents auto-suspension). */
let _keepAliveOscillator: OscillatorNode | null = null;

function startAudioCtxKeepAlive(ctx: AudioContext) {
    if (_keepAliveOscillator) return; // already running
    try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0; // completely silent
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        _keepAliveOscillator = osc;
    } catch { /* ignore */ }
}

export function resumeVisualizerCtx() {
    // Create the shared context if it doesn't exist yet (first user gesture),
    // then resume it. Calling this inside a click/touchstart handler guarantees
    // Chrome/Safari accept the resume() even before any useEffect has run.
    const ctx = getSharedAudioCtx();
    if (ctx && ctx.state !== 'running') {
        ctx.resume().then(() => {
            startAudioCtxKeepAlive(ctx);
            // Notify AudioVisualizer instances that context is now running
            if (typeof window !== 'undefined') window.dispatchEvent(new Event('audioCtxReady'));
        }).catch(() => { /* ignore */ });
    } else if (ctx && ctx.state === 'running') {
        startAudioCtxKeepAlive(ctx);
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('audioCtxReady'));
    }
}

function AudioVisualizer({ audioEl, accent }: {
    audioEl: HTMLAudioElement | null;
    accent: string;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instanceRef = useRef<any>(null);
    const prevElRef = useRef<HTMLAudioElement | null>(null);
    // ctxReady: becomes true once the AudioContext is running (after first user gesture).
    // Adding it to useEffect deps forces the visualizer to retry connection after gesture.
    const [ctxReady, setCtxReady] = useState(false);

    useEffect(() => {
        // Check immediately in case context was already resumed
        if (_sharedAudioCtx?.state === 'running') { setCtxReady(true); return; }
        const handler = () => { if (_sharedAudioCtx?.state === 'running') setCtxReady(true); };
        window.addEventListener('audioCtxReady', handler);
        return () => window.removeEventListener('audioCtxReady', handler);
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || !audioEl) {
            if (instanceRef.current) {
                try { instanceRef.current.destroy(); } catch { /* ok */ }
                instanceRef.current = null;
            }
            prevElRef.current = null;
            return;
        }
        // Same element + instance already running → just update the gradient colour
        if (prevElRef.current === audioEl && instanceRef.current) {
            const am = instanceRef.current;
            const hexRgba2 = (hex: string, a: number) => {
                const r = parseInt(hex.slice(1, 3), 16) || 0;
                const g = parseInt(hex.slice(3, 5), 16) || 0;
                const b = parseInt(hex.slice(5, 7), 16) || 0;
                return `rgba(${r},${g},${b},${a})`;
            };
            am.registerGradient('track', {
                bgColor: 'transparent',
                colorStops: [
                    { pos: 0, color: hexRgba2(accent, 1) },
                    { pos: 0.45, color: hexRgba2(accent, 0.82) },
                    { pos: 1, color: hexRgba2(accent, 0.22) },
                ],
            });
            am.gradient = 'track';
            return;
        }
        prevElRef.current = audioEl;

        // Destroy previous instance (old audio element) — does NOT close the shared AudioContext
        if (instanceRef.current) {
            try { instanceRef.current.destroy(); } catch { /* ok */ }
            instanceRef.current = null;
        }

        // Only use an existing AudioContext that is already running.
        // NEVER call getSharedAudioCtx() here — that creates a new suspended context,
        // and createMediaElementSource() on a suspended context silently kills audio output.
        // The context will be created + resumed by resumeVisualizerCtx() on first user gesture,
        // which dispatches 'audioCtxReady' → ctxReady state → this effect re-runs.

        const capturedEl = audioEl;
        void import('audiomotion-analyzer').then(async ({ default: AudioMotionAnalyzer }) => {
            if (!containerRef.current || prevElRef.current !== capturedEl) return;

            // Re-fetch context inside async callback (may have become available since effect ran)
            const ctx = getExistingAudioCtx();
            if (!ctx || ctx.state !== 'running') {
                // Context not ready yet — audio plays to speakers without WebAudio capture.
                // Will retry when 'audioCtxReady' fires (ctxReady state changes).
                return;
            }

            // Guard again: track may have changed while waiting
            if (!containerRef.current || prevElRef.current !== capturedEl) return;

            let sourceToPass: HTMLAudioElement | AudioNode = capturedEl;

            // Create and cache the MediaElementAudioSourceNode on the audio element.
            // This prevents "InvalidStateError" if it is initialized twice, and allows us
            // to recover the output routing later when the visualizer unmounts.
            if (!(capturedEl as any)._audioSourceNode) {
                try {
                    (capturedEl as any)._audioSourceNode = ctx.createMediaElementSource(capturedEl);
                } catch { /* already created by another library/call */ }
            }
            if ((capturedEl as any)._audioSourceNode) {
                sourceToPass = (capturedEl as any)._audioSourceNode as AudioNode;
            }

            try {
                const hexRgba = (hex: string, a: number) => {
                    const r = parseInt(hex.slice(1, 3), 16) || 0;
                    const g = parseInt(hex.slice(3, 5), 16) || 0;
                    const b = parseInt(hex.slice(5, 7), 16) || 0;
                    return `rgba(${r},${g},${b},${a})`;
                };
                const am = new AudioMotionAnalyzer(containerRef.current, {
                    audioCtx: ctx,
                    source: sourceToPass,
                    mode: 2,
                    gradient: 'prism',
                    showBgColor: false,
                    overlay: true,
                    showScaleX: false,
                    showScaleY: false,
                    showPeaks: false,
                    reflexRatio: 0.35,
                    reflexAlpha: 0.15,
                    barSpace: 0.35,
                    minFreq: 30,
                    maxFreq: 16000,
                    smoothing: 0.6,
                    fillAlpha: 1.0,
                    lineWidth: 0,
                    minDecibels: -85,
                    maxDecibels: -20,
                });
                am.registerGradient('track', {
                    bgColor: 'transparent',
                    colorStops: [
                        { pos: 0, color: hexRgba(accent, 1) },
                        { pos: 0.45, color: hexRgba(accent, 0.82) },
                        { pos: 1, color: hexRgba(accent, 0.22) },
                    ],
                });
                am.gradient = 'track';
                instanceRef.current = am;
                // Context is already running (awaited above). If the audio element was
                // playing before createMediaElementSource() rerouted it, ensure it keeps
                // playing through the WebAudio graph by re-calling play() (no pause needed).
                if (!capturedEl.paused) {
                    capturedEl.play().catch(() => { /* ignore — AbortError or policy */ });
                }
            } catch { /* AudioContext blocked or unsupported — audio still plays fine */ }
        });

        return () => {
            if (instanceRef.current) {
                try { instanceRef.current.destroy(); } catch { /* ok */ }
                instanceRef.current = null;

                // When AudioMotion is destroyed, it unhooks its AudioNodes from destination.
                // If this track is fading out during crossfade, it needs to keep outputting audio!
                // We manually reconnect the cached MediaElementAudioSourceNode to speakers.
                const existingCtx = getExistingAudioCtx();
                if (existingCtx && (capturedEl as any)._audioSourceNode) {
                    try { (capturedEl as any)._audioSourceNode.disconnect(); } catch { }
                    try { (capturedEl as any)._audioSourceNode.connect(existingCtx.destination); } catch { }
                }
            }
        };
    }, [audioEl, accent, ctxReady]); // ctxReady dep: re-run once context becomes available

    return <div ref={containerRef} className="w-full h-full" />;
}

// ─── Left panel: Channel list ─────────────────────────────────────────────────

function ChannelList({
    selected, onSelect, isDark,
}: {
    selected: ChannelSlug;
    onSelect: (slug: ChannelSlug) => void;
    isDark: boolean;
}) {
    return (
        <div className="hidden md:flex md:w-[140px] md:flex-shrink-0 md:flex-col md:gap-2 md:pb-10 md:pt-2">
            <p className={`mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Channels
            </p>
            {MUSIC_CHANNELS.map(ch => {
                const isSelected = selected === ch.slug;
                return (
                    <button
                        key={ch.slug}
                        onClick={() => onSelect(ch.slug as ChannelSlug)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-all ${isSelected
                            ? (isDark ? 'bg-white/12 font-semibold text-white' : 'bg-gray-900/8 font-semibold text-gray-900')
                            : (isDark ? 'text-gray-400 hover:bg-white/6 hover:text-gray-200' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700')
                            }`}
                    >
                        <span className="truncate leading-tight">
                            <span className={`text-[10px] font-medium block mb-0.5 ${isDark ? 'text-white/30' : 'text-gray-400'}`}>
                                m/
                            </span>
                            {ch.name}
                        </span>
                        {isSelected && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 ml-1 opacity-60" />}
                    </button>
                );
            })}
        </div>
    );
}

// ─── Right panel: Desktop actions ────────────────────────────────────────────

function DesktopActions({
    trackId, likesCount, savesCount, isLiked, isSaved,
    onLike, onSave, onShare, isDark,
}: {
    trackId: string;
    likesCount: number;
    savesCount: number;
    isLiked: boolean;
    isSaved: boolean;
    onLike: () => void;
    onSave: () => void;
    onShare: () => void;
    isDark: boolean;
}) {
    void trackId;
    return (
        <div className="hidden md:flex md:flex-shrink-0 md:flex-col md:items-center md:gap-5 md:pb-10">
            <button onClick={onLike} className="flex flex-col items-center gap-1">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full shadow-sm transition-all ${isLiked ? 'bg-red-100 text-red-500' : isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
                </div>
                <span className={`text-[11px] font-medium tabular-nums ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    {isLiked ? fmtCount(likesCount + 1) : fmtCount(likesCount)}
                </span>
            </button>

            <button onClick={onSave} className="flex flex-col items-center gap-1">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full shadow-sm transition-all ${isSaved ? 'bg-yellow-100 text-yellow-500' : isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {isSaved ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
                </div>
                <span className={`text-[11px] font-medium tabular-nums ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    {isSaved ? fmtCount(savesCount + 1) : fmtCount(savesCount)}
                </span>
            </button>

            <button onClick={onShare} className="flex flex-col items-center gap-1">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full shadow-sm transition-all ${isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    <Share2 className="w-5 h-5" />
                </div>
                <span className={`text-[11px] font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Share</span>
            </button>
        </div>
    );
}

// ─── Single music slide (visual only, no audio) ───────────────────────────────

function MusicSlide({
    track, channelMeta, isActive, isLiked, isSaved,
    isPlaying, onTogglePlay, volume, onVolumeChange,
    currentTime, duration, downloadProgress,
    onLike, onSave, onMenuOpen, onSeek, nearbyTracks, coverThemeIdx, audioEl, onYouTubeEnded,
}: {
    track: SlideTrack;
    channelMeta: AnyChannelMeta;
    isActive: boolean;
    isLiked: boolean;
    isSaved: boolean;
    isPlaying: boolean;
    onTogglePlay: () => void;
    volume: number;
    onVolumeChange: (v: number) => void;
    currentTime: number;
    duration: number;
    downloadProgress: number | null;
    onLike: () => void;
    onSave: () => void;
    onMenuOpen: () => void;
    onSeek: (time: number) => void;
    nearbyTracks?: SlideTrack[];
    coverThemeIdx?: number | null;
    audioEl?: HTMLAudioElement | null;
    onYouTubeEnded?: () => void;
}) {
    const trackTheme = getTrackVisualTheme(track, channelMeta.accent, isActive ? coverThemeIdx : undefined);
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const hasTitle = !!(track.title || track.artist);
    const [showIcon, setShowIcon] = useState<'play' | 'pause' | null>(null);
    const iconTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevVol = useRef(volume > 0 ? volume : 1);
    const isMuted = volume === 0;

    // YouTube iframe and ended detection are handled globally in MusicPlayerClient
    // (Video Pooling Pattern — same as mobile) — prevents fullscreen exit on track change.
    // TikTok still uses the per-slide approach below.

    // Shared state/refs for TikTok ended detection
    const [ytFading, setYtFading] = useState(false);
    const ytEndedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ytEndedFiredRef = useRef(false);
    // Stable ref so the effect doesn't re-run every render (onYouTubeEnded is an inline fn in parent)
    const onYouTubeEndedRef = useRef(onYouTubeEnded);
    useEffect(() => { onYouTubeEndedRef.current = onYouTubeEnded; }, [onYouTubeEnded]);

    // TikTok ended: no postMessage API — rely purely on fallback timer
    useEffect(() => {
        if (!isActive || !track.tiktokId) return;
        setYtFading(false);
        ytEndedFiredRef.current = false;
        if (ytEndedTimerRef.current) clearTimeout(ytEndedTimerRef.current);

        const fallbackMs = track.durationSec > 10 ? (track.durationSec + 3) * 1000 : 0;
        if (fallbackMs <= 0) return;
        const timer = setTimeout(() => {
            if (ytEndedFiredRef.current) return;
            ytEndedFiredRef.current = true;
            setYtFading(true);
            ytEndedTimerRef.current = setTimeout(() => { onYouTubeEndedRef.current?.(); }, 600);
        }, fallbackMs);
        return () => {
            clearTimeout(timer);
            if (ytEndedTimerRef.current) clearTimeout(ytEndedTimerRef.current);
        };
    }, [isActive, track.tiktokId, track.durationSec]);

    const handleTap = () => {
        onTogglePlay();
        setShowIcon(isPlaying ? 'pause' : 'play');
        if (iconTimerRef.current) clearTimeout(iconTimerRef.current);
        iconTimerRef.current = setTimeout(() => setShowIcon(null), 800);
    };

    const handleToggleMute = () => {
        if (isMuted) { onVolumeChange(prevVol.current); }
        else { prevVol.current = volume; onVolumeChange(0); }
    };

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none"
            style={{ background: (track.youtubeId || track.facebookId) && isActive ? '#000000' : trackTheme.background }}>

            {/* Ambient pulse rings */}
            {isActive && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                    {[1, 2, 3].map(i => (
                        <div key={i}
                            className="absolute rounded-full"
                            style={{
                                width: 220 + i * 90,
                                height: 220 + i * 90,
                                border: `1px solid ${trackTheme.accent}${i === 1 ? '25' : i === 2 ? '15' : '08'}`,
                                animation: isPlaying ? `ambientPulse ${2 + i * 0.4}s ease-in-out ${i * 0.3}s infinite` : 'none',
                            }} />
                    ))}
                </div>
            )}

            {/* Hamburger menu button — top left */}
            <button
                onClick={e => { e.stopPropagation(); onMenuOpen(); }}
                className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10 text-white hover:bg-black/60 transition-colors lg:hidden"
            >
                <Menu className="w-5 h-5" />
            </button>

            {/* Top: channel / playlist badge */}
            <div className="absolute top-[88px] left-0 right-0 flex justify-center z-10">
                <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
                    style={{ background: `${trackTheme.accent}20`, border: `1px solid ${trackTheme.accent}35` }}>
                    <Music2 className="w-3 h-3" style={{ color: trackTheme.accent }} />
                    <span className="text-xs font-medium" style={{ color: trackTheme.accent }}>
                        {track.channelSlug === 'playlist' ? channelMeta.name : channelMeta.label}
                    </span>
                </div>
            </div>

            {/* Center: Vinyl disc OR YouTube placeholder OR Facebook placeholder OR TikTok iframe */}
            {track.youtubeId ? (
                /* YouTube: global desktop iframe in MusicPlayerClient overlays this — empty placeholder */
                <div className="absolute inset-0 bottom-[130px] z-10 pointer-events-none" />
            ) : track.facebookId ? (
                /* Facebook: global desktop iframe in MusicPlayerClient overlays this — empty placeholder */
                <div className="absolute inset-0 bottom-[130px] z-10 pointer-events-none" />
            ) : track.tiktokId ? (
                /* TikTok embed — overflow-hidden clips the TikTok footer bar */
                <div
                    className={`absolute inset-0 bottom-[130px] z-10 overflow-hidden transition-opacity duration-[600ms] ${ytFading ? 'opacity-0' : 'opacity-100'}`}
                    onClick={e => e.stopPropagation()}
                >
                    {isActive && (
                        <iframe
                            src={`https://www.tiktok.com/embed/v2/${track.tiktokId}?autoplay=1&loop=0&refer=embed`}
                            className="w-full"
                            style={{ border: 'none', height: 'calc(100% + 80px)', marginBottom: '-80px' }}
                            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                            allowFullScreen
                        />
                    )}
                </div>
            ) : (
                /* Normal vinyl disc */
                <div className="flex flex-col items-center z-10 cursor-pointer" onClick={handleTap}>
                    <VinylDisc isSpinning={isActive && isPlaying} accent={trackTheme.accent} thumbnailUrl={track.thumbnailUrl} />
                </div>
            )}

            {/* Audio visualizer — hidden for YouTube/TikTok/Facebook tracks */}
            {!track.youtubeId && !track.tiktokId && !track.facebookId && (
                <div className="absolute bottom-[176px] inset-x-0 h-[80px] md:h-[120px] z-[5] pointer-events-none">
                    {isActive && audioEl
                        ? <AudioVisualizer audioEl={audioEl} accent={trackTheme.accent} />
                        : <div className="flex h-full items-end justify-center pb-4">
                            <SoundBars playing={isActive && isPlaying} />
                        </div>
                    }
                </div>
            )}

            {/* Play/pause flash icon */}
            {showIcon && (
                <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                    <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center"
                        style={{ animation: 'videoIconPop 0.8s ease forwards' }}>
                        {showIcon === 'pause'
                            ? <Pause className="w-8 h-8 text-white" />
                            : <Play className="w-8 h-8 text-white ml-1" />}
                    </div>
                </div>
            )}

            {/* Bottom gradient */}
            <div className="absolute inset-x-0 bottom-0 h-2/5 pointer-events-none"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)' }} />

            {/* Bottom info */}
            <div className="absolute bottom-0 left-4 right-16 pb-10 z-10">
                {hasTitle ? (
                    <>
                        <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="text-white font-bold text-lg leading-tight truncate drop-shadow">{track.title}</p>
                            {(track.source === 'local' || track.audioUrl?.startsWith('asset:')) && (
                                <HardDrive className="w-3.5 h-3.5 text-indigo-300/80 flex-shrink-0" aria-label="Local file" />
                            )}
                        </div>
                        {track.artist && <p className="text-white/65 text-sm mt-0.5 truncate">{track.artist}</p>}
                    </>
                ) : (
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${channelMeta.accent}30` }}>
                            <Music2 className="w-4 h-4" style={{ color: trackTheme.accent }} />
                        </div>
                        <div>
                            <p className="text-white/80 font-semibold text-sm">{channelMeta.name}</p>
                            <p className="text-white/40 text-xs">Track {track.id.slice(-6)}</p>
                        </div>
                    </div>
                )}

                {/* Progress bar + inline volume — hidden for YouTube/Facebook/TikTok embed tracks */}
                {!track.youtubeId && !track.tiktokId && !track.facebookId && (
                    <div className="mt-3 flex items-center gap-1.5">
                        {/* Download progress bar — shown while the track blob is being fetched */}
                        {downloadProgress !== null ? (
                            <div className="flex-1 flex flex-col gap-1">
                                <div className="w-full h-[3px] rounded-full bg-white/15 overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-[width] duration-300"
                                        style={{ width: `${downloadProgress}%`, background: trackTheme.accent }}
                                    />
                                </div>
                                <span className="text-white/50 text-[10px]">
                                    {downloadProgress < 100 ? `⬇ ${downloadProgress}%` : '✓'}
                                </span>
                            </div>
                        ) : (
                            <div
                                className="flex-1 relative flex items-center cursor-pointer"
                                style={{ height: 18 }}
                                onClick={e => {
                                    e.stopPropagation();
                                    if (duration <= 0) return;
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    onSeek(((e.clientX - rect.left) / rect.width) * duration);
                                }}
                            >
                                <div className="w-full h-[3px] rounded-full bg-white/15 relative overflow-visible">
                                    <div className="h-full rounded-full" style={{ width: `${progress}%`, background: trackTheme.accent }} />
                                    {duration > 0 && (
                                        <div
                                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full pointer-events-none shadow-sm"
                                            style={{ left: `max(0px, calc(${progress}% - 6px))`, background: trackTheme.accent, border: '1.5px solid rgba(255,255,255,0.5)' }}
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                        {downloadProgress === null && duration > 0 && (
                            <span className="text-white/40 text-[10px] tabular-nums flex-shrink-0">
                                {fmtTime(currentTime)}
                            </span>
                        )}
                        <button
                            onClick={e => { e.stopPropagation(); handleToggleMute(); }}
                            className="flex-shrink-0 text-white/60 hover:text-white transition-colors"
                        >
                            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        </button>
                        <input
                            type="range" min={0} max={1} step={0.05}
                            value={volume}
                            onClick={e => e.stopPropagation()}
                            onChange={e => {
                                const v = parseFloat(e.target.value);
                                if (v > 0) prevVol.current = v;
                                onVolumeChange(v);
                            }}
                            className="w-14 flex-shrink-0 cursor-pointer"
                            style={{ height: 3, accentColor: trackTheme.accent }}
                        />
                    </div>
                )}
            </div>

            {/* Mobile right action icons */}
            <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-4 md:hidden">
                <button onClick={onLike} className="flex flex-col items-center gap-1">
                    <div className={`w-11 h-11 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center border border-white/10 ${isLiked ? 'text-red-400' : 'text-white'}`}>
                        <Heart className="w-5 h-5" fill={isLiked ? 'currentColor' : 'none'} />
                    </div>
                </button>
                <button onClick={onSave} className="flex flex-col items-center gap-1">
                    <div className={`w-11 h-11 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center border border-white/10 ${isSaved ? 'text-yellow-400' : 'text-white'}`}>
                        {isSaved ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
                    </div>
                </button>
            </div>
        </div>
    );
}

// ─── Desktop track list panel (xl+, right of the card) ───────────────────────

// ─── Desktop track list (right panel, Related-Words style) ───────────────────

function DesktopTrackList({
    slides, activeIndex, isDark, isVietnamese, onJumpToSlide,
}: {
    slides: SlideTrack[];
    activeIndex: number;
    isDark: boolean;
    isVietnamese: boolean;
    onJumpToSlide: (idx: number) => void;
}) {
    const activeRef = useRef<HTMLButtonElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const btn = activeRef.current;
        const container = containerRef.current;
        if (!btn || !container) return;
        // Scroll only within the 156px container — never touch the page scroll
        const btnTop = btn.offsetTop;
        const btnBottom = btnTop + btn.offsetHeight;
        const { scrollTop, clientHeight } = container;
        if (btnTop < scrollTop) {
            container.scrollTop = btnTop - 4;
        } else if (btnBottom > scrollTop + clientHeight) {
            container.scrollTop = btnBottom - clientHeight + 4;
        }
    }, [activeIndex]);

    const activeSlug = slides[activeIndex]?.channelSlug ?? 'background-music';
    const channelMeta = MUSIC_CHANNELS.find(c => c.slug === activeSlug) ?? PLAYLIST_META;

    if (slides.length === 0) return <div className="hidden md:block md:w-[124px] md:flex-shrink-0" />;

    return (
        <div className="hidden md:flex md:w-[124px] md:flex-shrink-0 flex-col gap-2 pb-10 pt-[72px] pr-1">
            {/* section label */}
            <p className={`px-1 text-[10px] font-semibold uppercase tracking-[0.2em] leading-none mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'
                }`}>
                {activeSlug === 'playlist'
                    ? t('Playlist', 'Playlist', isVietnamese)
                    : t('Kênh', 'Channel', isVietnamese)}
            </p>

            {/* Scrollable pill list — ~3 items visible */}
            <div
                ref={containerRef}
                className="flex flex-col gap-2 overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full"
                style={{
                    maxHeight: '156px', // ~3 × (42px pill + 8px gap)
                    scrollbarColor: isDark ? 'rgba(255,255,255,0.18) transparent' : 'rgba(0,0,0,0.18) transparent',
                }}
            >
                {slides.map((slide, idx) => {
                    const isActive = idx === activeIndex;
                    const trackTheme = getTrackVisualTheme(slide, channelMeta.accent);
                    return (
                        <button
                            key={`tl-${slide.id}-${idx}`}
                            ref={isActive ? activeRef : null}
                            onClick={() => onJumpToSlide(idx)}
                            className={`rounded-2xl border px-3 py-2 text-left text-[11px] font-semibold shadow-sm transition-all leading-tight ${isActive
                                ? isDark
                                    ? 'border-transparent text-white'
                                    : 'border-transparent text-white'
                                : isDark
                                    ? 'border-gray-700 bg-gray-800 text-gray-300 hover:text-white hover:border-indigo-400/40 hover:bg-indigo-500/10'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700'
                                }`}
                            style={isActive
                                ? { background: trackTheme.accent, borderColor: trackTheme.accent }
                                : {}}
                        >
                            <span className="block truncate">
                                {slide.title || `Track ${slide.id.slice(-5)}`}
                            </span>
                            {slide.artist && (
                                <span className={`block truncate text-[10px] font-normal mt-0.5 ${isActive ? 'text-white/70' : isDark ? 'text-gray-500' : 'text-gray-400'
                                    }`}>
                                    {slide.artist}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Section wrapper (3-col desktop layout per slide) ────────────────────────

function MusicSection({
    slide, channelMeta, isActive, isDark, isVietnamese,
    isLiked, isSaved,
    isPlaying, onTogglePlay, volume, onVolumeChange,
    currentTime, duration, downloadProgress,
    onLike, onSave, onShare,
    onMenuOpen,
    likesCount, savesCount,
    slides, activeIndex, onJumpToSlide, onSeek, nearbyTracks, coverThemeIdx, audioEl, onYouTubeEnded,
}: {
    slide: SlideTrack;
    channelMeta: AnyChannelMeta;
    isActive: boolean;
    isDark: boolean;
    isVietnamese: boolean;
    isLiked: boolean;
    isSaved: boolean;
    isPlaying: boolean;
    onTogglePlay: () => void;
    volume: number;
    onVolumeChange: (v: number) => void;
    currentTime: number;
    duration: number;
    downloadProgress: number | null;
    onLike: () => void;
    onSave: () => void;
    onShare: () => void;
    onMenuOpen: () => void;
    likesCount: number;
    savesCount: number;
    slides: SlideTrack[];
    activeIndex: number;
    onJumpToSlide: (idx: number) => void;
    onSeek: (time: number) => void;
    nearbyTracks: SlideTrack[];
    coverThemeIdx?: number | null;
    audioEl?: HTMLAudioElement | null;
    onYouTubeEnded?: () => void;
}) {
    return (
        <div className="flex h-full w-full items-center justify-center overflow-visible px-0 md:px-4">
            <div className="flex h-full w-full items-center justify-center overflow-visible md:gap-[25px]">

                {/* LEFT: Desktop track list — 25 px gap from card (md+ only) */}
                <DesktopTrackList
                    slides={slides}
                    activeIndex={activeIndex}
                    isDark={isDark}
                    isVietnamese={isVietnamese}
                    onJumpToSlide={onJumpToSlide}
                />

                {/* Center: Music card — data-music-card used by global desktop YT iframe to track position */}
                <div data-music-card className="h-full w-full max-w-none md:w-[390px] md:max-w-none md:h-[min(calc(100svh-48px),780px)] md:aspect-[9/16] overflow-hidden rounded-none md:rounded-[28px] md:shadow-[0_24px_80px_rgba(0,0,0,0.28)] flex-shrink-0">
                    <MusicSlide
                        track={slide}
                        channelMeta={channelMeta}
                        isActive={isActive}
                        isLiked={isLiked}
                        isSaved={isSaved}
                        isPlaying={isPlaying}
                        onTogglePlay={onTogglePlay}
                        volume={volume}
                        onVolumeChange={onVolumeChange}
                        currentTime={isActive ? currentTime : 0}
                        duration={isActive ? duration : slide.durationSec}
                        downloadProgress={isActive ? downloadProgress : null}
                        onLike={onLike}
                        onSave={onSave}
                        onMenuOpen={onMenuOpen}
                        onSeek={onSeek}
                        nearbyTracks={nearbyTracks}
                        coverThemeIdx={coverThemeIdx}
                        audioEl={audioEl}
                        onYouTubeEnded={onYouTubeEnded}
                    />
                </div>

                {/* RIGHT: Desktop actions */}
                <DesktopActions
                    trackId={slide.id}
                    likesCount={likesCount}
                    savesCount={savesCount}
                    isLiked={isLiked}
                    isSaved={isSaved}
                    onLike={onLike}
                    onSave={onSave}
                    onShare={onShare}
                    isDark={isDark}
                />
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

const INITIAL_LOAD = 8;
const LOAD_MORE_THRESHOLD = 3;
const LOAD_MORE_BATCH = 5;
const MAX_SLIDES = 30;

export default function MusicPlayerClient() {
    const { isDark } = useTheme();
    const { isVietnamese } = useLanguage();
    const { user } = useWordaiAuth();

    const [selectedChannel, setSelectedChannel] = useState<ChannelSlug>(() => {
        if (typeof window === 'undefined') return 'background-music';
        const ctx = loadLastCtx();
        return ctx?.type === 'channel' ? ctx.slug : 'background-music';
    });
    const [slides, setSlides] = useState<SlideTrack[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // Audio state
    const [isPlaying, setIsPlaying] = useState(true);
    const [volume, setVolume] = useState(1);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    // Like is local, Save is derived from remote playlists
    const [likedIds, setLikedIds] = useState<Set<string>>(() => {
        if (typeof window === 'undefined') return new Set();
        return getLiked();
    });
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
    const [playlistOptions, setPlaylistOptions] = useState<MusicPlaylist[]>([]);
    const [playlistPickerLoading, setPlaylistPickerLoading] = useState(false);
    const [playlistPickerError, setPlaylistPickerError] = useState('');
    const [playlistPickerTrackId, setPlaylistPickerTrackId] = useState<string | null>(null);

    // Sidebar
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [subTab, setSubTab] = useState<'library' | 'shorts'>('library');
    const [currentPlaylistName, setCurrentPlaylistName] = useState('');
    const [autoplayBlocked, setAutoplayBlocked] = useState(false);
    // Download progress for current track (0-100 while downloading, null otherwise)
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

    // YouTube embed origin: must be a valid HTTP origin for YouTube's embed API.
    // tauri-plugin-localhost serves the production app at http://localhost:14789.
    // If window.location.origin is still 'tauri://localhost' (plugin not active or
    // serving via asset:// instead of HTTP), fall back to the known localhost plugin port.
    const ytEmbedOrigin = typeof window !== 'undefined'
        ? (window.location.origin.startsWith('http')
            ? window.location.origin  // http://localhost:3001 (prod via plugin) or dev
            : ((window as unknown as Record<string, unknown>).__TAURI_DESKTOP__ ? 'http://localhost:3001' : 'https://wynai.pro'))
        : 'https://wynai.pro';

    // Shuffle (default: ON)
    const [isShuffle, setIsShuffle] = useState<boolean>(() => {
        if (typeof window === 'undefined') return true;
        return loadShuffleState();
    });
    // Cover-based theme index for the active slide
    const [coverThemeIdx, setCoverThemeIdx] = useState<number | null>(null);
    // Audio element for the current track (reactive, drives AudioVisualizer)
    const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

    // ── Global desktop YouTube iframe (Video Pooling Pattern — same as mobile) ──────────────────────────
    // One persistent <iframe> positioned:fixed over the card prevents fullscreen exit on track change.
    // Track changes use postMessage loadVideoById; the DOM element is never unmounted.
    const desktopYtIframeRef = useRef<HTMLIFrameElement | null>(null);
    const [desktopGlobalYtId, setDesktopGlobalYtId] = useState<string | null>(null);
    const desktopLastLoadedYtIdRef = useRef<string | null>(null);
    const desktopYtEndedFiredRef = useRef(false);
    const desktopYtEndedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const desktopYtAutoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [desktopYtFading, setDesktopYtFading] = useState(false);
    const [desktopYtPlaying, setDesktopYtPlaying] = useState(false);
    const [desktopCardRect, setDesktopCardRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
    const [ytFullMode, setYtFullMode] = useState(true);  // default full content mode for YouTube/Facebook
    const [mainContentRect, setMainContentRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

    // ── Global desktop Facebook iframe ─────────────────────────────────────
    // Uses a standard <iframe> (no postMessage API — just update src on track switch).
    const desktopFbIframeRef = useRef<HTMLIFrameElement | null>(null);
    const [desktopFbEmbedUrl, setDesktopFbEmbedUrl] = useState<string | null>(null);
    const [desktopFbFading, setDesktopFbFading] = useState(false);
    const desktopFbCurrentIdRef = useRef<string | null>(null); // fbId currently loaded into the iframe
    const desktopFbEndedFiredRef = useRef(false);
    const desktopFbEndedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const fadingOutRef = useRef<HTMLAudioElement | null>(null); // holds audio being faded out during crossfade
    const crossfadeAdvanceRef = useRef(false); // true when next track should fade in
    const feedRef = useRef<HTMLDivElement>(null);
    const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
    const channelTracksRef = useRef<Partial<Record<ChannelSlug, Track[]>>>({});
    // Full playlist track list for pagination (play next batch when near end)
    const playlistAllTracksRef = useRef<SidebarTrack[]>([]);
    const isSwitchingChannel = useRef(false);
    const isLoadingMore = useRef(false);
    // Used to auto-switch to the most recent playlist only once on first sync
    const hasAutoLoadedPlaylist = useRef(false);
    // Tracks current selectedChannel without closure staleness (used in loadAndBuildSlides)
    const selectedChannelRef = useRef(selectedChannel);
    useEffect(() => { selectedChannelRef.current = selectedChannel; }, [selectedChannel]);
    // Stable ref for activeIndex so advanceToNext always reads the latest value without stale closure
    const activeIndexRef = useRef(0);
    useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);

    const advanceToNext = useCallback(() => {
        // We set crossfadeAdvanceRef *just* before calling advanceToNext inside timeupdate
        setIsPlaying(true); // ensure play state is set even from non-gesture crossfade

        // Read current index from ref (avoids stale closure inside setTimeout)
        const total = slideRefs.current.length;
        const nextIdx = activeIndexRef.current + 1 >= total ? 0 : activeIndexRef.current + 1;

        // Scroll first (imperative DOM), then update state
        const container = feedRef.current;
        if (container) {
            isSwitchingChannel.current = true;
            container.scrollTop = nextIdx * container.clientHeight;
            setTimeout(() => { isSwitchingChannel.current = false; }, 300);
        }
        setActiveIndex(nextIdx);
    }, []);

    const syncRemotePlaylists = useCallback(async () => {
        setPlaylistPickerLoading(true);
        setPlaylistPickerError('');
        try {
            const lists = await getMusicPlaylists();
            // Derive youtubeId from audioUrl for tracks saved before youtubeId was a D1 column
            const normalizedLists = lists.map(pl => ({
                ...pl,
                tracks: pl.tracks.map(t => ({
                    ...t,
                    youtubeId: t.youtubeId ?? (t.audioUrl.startsWith('yt:') ? t.audioUrl.slice(3) : undefined),
                    tiktokId: t.tiktokId ?? (t.audioUrl.startsWith('tt:') ? t.audioUrl.slice(3) : undefined),
                    facebookId: t.facebookId ?? (t.audioUrl.startsWith('fbreel:') ? t.audioUrl.slice(7) : t.audioUrl.startsWith('fb:') ? t.audioUrl.slice(3) : undefined),
                    facebookIsReel: t.audioUrl.startsWith('fbreel:') ? true : undefined,
                })),
            }));
            setPlaylistOptions(normalizedLists);
            setSavedIds(new Set(normalizedLists.flatMap((playlist) => playlist.tracks.map((track) => track.id))));
        } catch (error) {
            setPlaylistPickerError((error as Error).message || 'Failed to load playlists');
            setPlaylistOptions([]);
            setSavedIds(new Set());
        } finally {
            setPlaylistPickerLoading(false);
        }
    }, []);

    // ── Load channel data ────────────────────────────────────────────────────

    const loadAndBuildSlides = useCallback(async (slug: ChannelSlug, initial = true) => {
        if (initial) {
            setIsLoading(true);
            setActiveIndex(0);
            slideRefs.current = [];
            isSwitchingChannel.current = true;
        } else {
            if (isLoadingMore.current) return;
            isLoadingMore.current = true;
        }

        try {

            let tracks = channelTracksRef.current[slug];
            if (!tracks) {
                tracks = await loadChannel(slug);
                channelTracksRef.current[slug] = tracks;
            }

            // Abort if the user/auto-load already switched to a playlist while we were fetching
            if (initial && selectedChannelRef.current === 'playlist') {
                setIsLoading(false);
                isSwitchingChannel.current = false;
                return;
            }

            if (!tracks || tracks.length === 0) {
                if (initial) setIsLoading(false);
                else isLoadingMore.current = false;
                return;
            }

            const batch = popTracks(slug, tracks, initial ? INITIAL_LOAD : LOAD_MORE_BATCH);
            const newSlides: SlideTrack[] = batch.map(t => ({ ...t, channelSlug: slug }));

            if (initial) {
                setSlides(newSlides);
                // Scroll to top
                setTimeout(() => {
                    feedRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
                    setTimeout(() => { isSwitchingChannel.current = false; }, 200);
                }, 50);
                setIsLoading(false);
            } else {
                setSlides(prev => [...prev, ...newSlides]);
                isLoadingMore.current = false;
            }

        } catch {
            // Ensure loading spinner never hangs (e.g. localStorage quota error)
            if (initial) setIsLoading(false);
            else isLoadingMore.current = false;
        }
    }, []);

    // Initial load — restore last context (playlist or channel)
    useEffect(() => {
        const ctx = loadLastCtx();
        if (ctx?.type === 'playlist' && ctx.tracks.length > 0) {
            // Store full playlist for load-more, display first MAX_SLIDES tracks only
            playlistAllTracksRef.current = ctx.tracks;
            const newSlides: SlideTrack[] = ctx.tracks.slice(0, MAX_SLIDES).map(tr => ({
                id: tr.id, title: tr.title, artist: tr.artist,
                audioUrl: tr.audioUrl, durationSec: tr.durationSec,
                source: tr.source, thumbnailUrl: tr.thumbnailUrl,
                youtubeId: tr.youtubeId,
                tiktokId: tr.tiktokId,
                facebookId: tr.facebookId,
                facebookIsReel: tr.facebookId ? (tr.audioUrl.startsWith('fbreel:') ? true : undefined) : undefined,
                channelSlug: 'playlist',
            }));
            setSlides(newSlides);
            setSelectedChannel('playlist' as ChannelSlug);
            setIsLoading(false);
        } else {
            const slug = ctx?.type === 'channel' ? ctx.slug : 'background-music';
            loadAndBuildSlides(slug, true);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!user) {
            // Reset so next login triggers the auto-load again
            hasAutoLoadedPlaylist.current = false;
            return;
        }
        void syncRemotePlaylists();
    }, [syncRemotePlaylists, user]);

    // Auto-switch to the most recent playlist on first successful sync.
    // Fires whenever playlistOptions changes; the ref ensures it only acts once per session.
    useEffect(() => {
        if (hasAutoLoadedPlaylist.current) return;
        if (playlistOptions.length === 0) return;

        hasAutoLoadedPlaylist.current = true;

        // Use the ref (not state) to avoid stale closure — the ref is always current
        if (selectedChannelRef.current === 'playlist') return;

        const mostRecent = playlistOptions[0];
        if (!mostRecent || mostRecent.tracks.length === 0) return;

        // Store full playlist for load-more; display first MAX_SLIDES tracks only
        playlistAllTracksRef.current = mostRecent.tracks;
        const newSlides: SlideTrack[] = mostRecent.tracks.slice(0, MAX_SLIDES).map(t => ({
            id: t.id, title: t.title, artist: t.artist,
            audioUrl: t.audioUrl, durationSec: t.durationSec,
            source: t.source as 'youtube' | 'tiktok' | 'local' | 'facebook',
            thumbnailUrl: t.thumbnailUrl,
            youtubeId: t.youtubeId,
            tiktokId: t.tiktokId,
            facebookId: t.facebookId,
            facebookIsReel: t.facebookId ? (t.audioUrl.startsWith('fbreel:') ? true : undefined) : undefined,
            channelSlug: 'playlist',
        }));
        saveLastCtx({ type: 'playlist', id: mostRecent.id, name: mostRecent.name, tracks: mostRecent.tracks.slice(0, 50) });

        isSwitchingChannel.current = true;
        slideRefs.current = [];
        setCurrentPlaylistName(mostRecent.name);
        setSlides(newSlides);
        setSelectedChannel('playlist' as ChannelSlug);
        setActiveIndex(0);
        setIsPlaying(true);
        setTimeout(() => {
            feedRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
            setTimeout(() => { isSwitchingChannel.current = false; }, 200);
        }, 80);
    }, [playlistOptions]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleUpdated = () => { void syncRemotePlaylists(); };
        window.addEventListener(MUSIC_PLAYLISTS_UPDATED_EVENT, handleUpdated);
        return () => window.removeEventListener(MUSIC_PLAYLISTS_UPDATED_EVENT, handleUpdated);
    }, [syncRemotePlaylists]);

    // ── IntersectionObserver for active slide ────────────────────────────────

    useEffect(() => {
        const container = feedRef.current;
        if (!container) return;

        let ioDebounce: ReturnType<typeof setTimeout> | null = null;
        const observer = new IntersectionObserver(
            (entries) => {
                if (isSwitchingChannel.current) return;
                entries.forEach(entry => {
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
                        const idx = slideRefs.current.indexOf(entry.target as HTMLDivElement);
                        if (idx !== -1 && idx !== activeIndexRef.current) {
                            // Debounce to avoid rapid-fire index changes during scroll momentum
                            if (ioDebounce) clearTimeout(ioDebounce);
                            ioDebounce = setTimeout(() => {
                                if (isSwitchingChannel.current) return;
                                setActiveIndex(idx);
                                setIsPlaying(true);
                            }, 80);
                        } else if (idx === activeIndexRef.current) {
                            // Same index, just ensure playing
                            setIsPlaying(true); // Auto-play when swiping to a new track
                            // Load more near end
                            if (idx >= slideRefs.current.length - LOAD_MORE_THRESHOLD) {
                                const slug = slides[idx]?.channelSlug;
                                if (slug === 'playlist') {
                                    // Load more playlist tracks from the full list ref
                                    if (!isLoadingMore.current) {
                                        const allTracks = playlistAllTracksRef.current;
                                        const currentCount = slides.length;
                                        if (currentCount < allTracks.length) {
                                            isLoadingMore.current = true;
                                            const next = allTracks.slice(currentCount, currentCount + LOAD_MORE_BATCH);
                                            const newSlides: SlideTrack[] = next.map(t => ({
                                                id: t.id, title: t.title, artist: t.artist,
                                                audioUrl: t.audioUrl, durationSec: t.durationSec,
                                                source: t.source, thumbnailUrl: t.thumbnailUrl,
                                                youtubeId: t.youtubeId,
                                                tiktokId: t.tiktokId,
                                                facebookId: t.facebookId,
                                                facebookIsReel: t.facebookId ? (t.audioUrl.startsWith('fbreel:') ? true : undefined) : undefined,
                                                channelSlug: 'playlist',
                                            }));
                                            setSlides(prev => [...prev, ...newSlides]);
                                            isLoadingMore.current = false;
                                        }
                                    }
                                } else if (slug) {
                                    loadAndBuildSlides(slug, false);
                                }
                            }
                        }
                    }
                });
            },
            { root: container, threshold: 0.55 },
        );

        const els = slideRefs.current;
        els.forEach(el => { if (el) observer.observe(el); });
        return () => { observer.disconnect(); if (ioDebounce) clearTimeout(ioDebounce); };
    }, [slides, loadAndBuildSlides]);

    // ── Audio management (desktop) ────────────────────────────────────────────
    // SINGLE global Audio element — NEVER destroyed/recreated.
    // WKWebView grants autoplay permission per DOM element. If we create a new
    // Audio() on each track change, the new element lacks user-gesture authorization
    // and .play() is blocked. By reusing the same element and only swapping .src,
    // the browser remembers "this element was authorized" → play() works forever.

    const currentBlobUrlRef = useRef<string | null>(null);

    // Create the singleton Audio element once on mount
    useEffect(() => {
        if (!audioRef.current) {
            const a = new Audio();
            a.preload = 'auto';
            // Do NOT set crossOrigin="anonymous" to avoid CORS failures on CDN MP3s
            audioRef.current = a;
            setAudioEl(a);
        }
        return () => {
            const a = audioRef.current;
            if (a) { a.pause(); a.src = ''; }
        };
    }, []);

    // Crossfade duration
    const CROSSFADE_S = 3;

    // Linear volume ramp helper used for crossfade between tracks
    const rampVolume = (a: HTMLAudioElement, from: number, to: number, ms: number, onDone?: () => void) => {
        const steps = Math.max(1, Math.ceil(ms / 50));
        let step = 0;
        const iv = setInterval(() => {
            step++;
            a.volume = Math.max(0, Math.min(1, from + (to - from) * (step / steps)));
            if (step >= steps) { clearInterval(iv); a.volume = to; onDone?.(); }
        }, 50);
        return iv;
    };

    // Track-change effect: swap src on the singleton audio, never recreate it
    useEffect(() => {
        const track = slides[activeIndex];
        if (!track?.audioUrl) return;

        const audio = audioRef.current;

        // Use embed player only when the audioUrl is an embed-prefix (no real HTTP audio) OR it's a YouTube track.
        // TikTok/Facebook imported tracks have tiktokId/facebookId set BUT also have a real R2 audioUrl.
        // In that case we play the audio directly — TikTok embeds are blocked outside tiktok.com.
        const hasRealAudioUrl = track.audioUrl.startsWith('http') || track.audioUrl.startsWith('asset:');
        const useEmbedPath = track.youtubeId ||
            (!hasRealAudioUrl && (track.tiktokId || track.facebookId)) ||
            track.audioUrl.startsWith('yt:') || track.audioUrl.startsWith('tt:') ||
            track.audioUrl.startsWith('fb:') || track.audioUrl.startsWith('fbreel:');

        // YouTube/TikTok/Facebook embed tracks: pause audio but keep the element alive
        if (useEmbedPath) {
            if (audio) { audio.pause(); audio.src = ''; }
            setCurrentTime(0);
            setDuration(track.durationSec || 0);
            return;
        }

        // Stop current playback (but keep the element)
        if (audio) { audio.pause(); }
        if (currentBlobUrlRef.current) {
            URL.revokeObjectURL(currentBlobUrlRef.current);
            currentBlobUrlRef.current = null;
        }

        let cancelled = false;

        const init = async () => {
            let url = track.audioUrl;
            let blobUrl: string | null = null;

            // ── Audio resolution & caching ───────────────────────────────────────────
            // Priority: local IndexedDB → session memory → download with progress → direct URL
            if (url.startsWith('local:')) {
                const blob = await getAudioBlob(track.id);
                if (!blob || cancelled) return;
                blobUrl = URL.createObjectURL(blob);
            } else {
                // 1. Check persistent cache (IndexedDB — survives app restarts)
                const persistedBlob = await getAudioBlob(track.id);
                if (persistedBlob && !cancelled) {
                    blobUrl = URL.createObjectURL(persistedBlob);
                    setSessionBlob(track.id, persistedBlob);
                } else if (!cancelled) {
                    // 2. Check session memory (fast, in-memory, lost on reload)
                    const sessionBlob = getSessionBlob(track.id);
                    if (sessionBlob) {
                        blobUrl = URL.createObjectURL(sessionBlob);
                    } else if (hasRealAudioUrl && url.startsWith('http')) {
                        // 3. Download with progress — show progress bar, play from blob
                        setDownloadProgress(0);
                        try {
                            const resp = await fetch(url);
                            if (resp.ok && !cancelled) {
                                const contentLength = parseInt(resp.headers.get('content-length') || '0');
                                const reader = resp.body!.getReader();
                                const chunks: Uint8Array<ArrayBuffer>[] = [];
                                let loaded = 0;
                                while (true) {
                                    const { done, value } = await reader.read();
                                    if (cancelled) { reader.cancel(); setDownloadProgress(null); return; }
                                    if (done) break;
                                    chunks.push(value);
                                    loaded += value.length;
                                    if (contentLength > 0) {
                                        setDownloadProgress(Math.min(99, Math.round((loaded / contentLength) * 100)));
                                    }
                                }
                                const blob = new Blob(chunks, { type: resp.headers.get('content-type') || 'audio/mpeg' });
                                setSessionBlob(track.id, blob);
                                void cacheAudioBlob(track.id, blob); // persist to IndexedDB
                                blobUrl = URL.createObjectURL(blob);
                                setDownloadProgress(100);
                                setTimeout(() => setDownloadProgress(null), 600);
                            } else {
                                setDownloadProgress(null);
                                // Fallback: play directly from remote URL
                            }
                        } catch {
                            setDownloadProgress(null);
                            // Fallback: play directly from remote URL
                        }
                    }
                }
            }

            if (cancelled) { if (blobUrl) URL.revokeObjectURL(blobUrl); return; }

            currentBlobUrlRef.current = blobUrl;

            if (!audio) return;
            audio.volume = volume;

            // Assign event handlers (on... style replaces previous handlers automatically)
            audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
            audio.onloadedmetadata = () => setDuration(audio.duration || 0);
            audio.onended = () => {
                if (!cancelled) {
                    recordTrackPlay(track.id);
                    advanceToNext();
                }
            };
            audio.onerror = () => {
                // Guard: skip if src is empty (not a real load error) or the element has no src
                if (!audio.src || audio.src === window.location.href) return;
                const code = audio.error?.code;
                console.warn('[Audio] onerror code:', code, 'src:', audio.src.slice(0, 80));
                if (!cancelled) advanceToNext();
            };
            audio.onplaying = () => setAutoplayBlocked(false);

            // Swap source on the SAME element — WKWebView keeps autoplay permission
            audio.src = blobUrl ?? url;
            audio.load();

            setAudioEl(audio);
            setCurrentTime(0);
            setDuration(0);

            if (isPlaying) {
                const isCrossfadeIn = crossfadeAdvanceRef.current;
                const targetVol = volume;

                if (isCrossfadeIn) {
                    audio.volume = 0;
                    crossfadeAdvanceRef.current = false;
                }

                // Call play() directly — do NOT wrap in ctx.resume().then() because the
                // async delay causes WKWebView to revoke autoplay permission on the element.
                // The AudioContext is only needed for the visualizer, not for playback itself.
                void audio.play()
                    .then(() => {
                        setAutoplayBlocked(false);
                        if (isCrossfadeIn) {
                            rampVolume(audio, 0, targetVol, CROSSFADE_S * 1000);
                        }
                    })
                    .catch((err: unknown) => {
                        const name = (err as { name?: string })?.name;
                        if (name === 'NotAllowedError') setAutoplayBlocked(true);
                    });

                // Resume AudioContext separately so the visualizer can connect (non-blocking)
                const ctx = getExistingAudioCtx();
                if (ctx && ctx.state !== 'running') {
                    ctx.resume().catch(() => { });
                }
            }

            // Cache current track blob for instant replay
            if (!blobUrl && !url.startsWith('local:') && !url.startsWith('asset:')) {
                void (async () => {
                    try {
                        const res = await fetch(track.audioUrl);
                        if (res.ok && !cancelled) {
                            const blob = await res.blob();
                            if (!cancelled) {
                                setSessionBlob(track.id, blob);
                                void cacheAudioBlob(track.id, blob);
                            }
                        }
                    } catch { /* ignore */ }
                })();
            }

            // Pre-fetch next track blob (+ 2 tracks ahead) and save to IndexedDB
            const tracksToPreFetch = [slides[activeIndex + 1], slides[activeIndex + 2]].filter(Boolean);
            for (const nextTrack of tracksToPreFetch) {
                if (!nextTrack?.audioUrl) continue;
                const nextUrl = nextTrack.audioUrl;
                if (nextUrl.startsWith('local:') || nextUrl.startsWith('asset:') || nextUrl.startsWith('yt:') || nextUrl.startsWith('tt:') || nextUrl.startsWith('fb:') || nextUrl.startsWith('fbreel:')) continue;
                if (getSessionBlob(nextTrack.id)) continue;
                void (async () => {
                    // Check IndexedDB first — avoid redundant fetch
                    const existing = await getAudioBlob(nextTrack.id);
                    if (existing) { setSessionBlob(nextTrack.id, existing); return; }
                    if (cancelled) return;
                    try {
                        const res = await fetch(nextUrl);
                        if (res.ok && !cancelled) {
                            const blob = await res.blob();
                            if (!cancelled) {
                                setSessionBlob(nextTrack.id, blob);
                                void cacheAudioBlob(nextTrack.id, blob);
                            }
                        }
                    } catch { /* ignore */ }
                })();
            }
        };

        void init();

        return () => {
            cancelled = true;
            setDownloadProgress(null);
            if (currentBlobUrlRef.current) {
                URL.revokeObjectURL(currentBlobUrlRef.current);
                currentBlobUrlRef.current = null;
            }
        };
        // NOTE: depend on activeIndex + track ID (not the full slides array) so that
        // load-more appending tracks at the end doesn't cancel a running init().
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeIndex, slides[activeIndex]?.id]);

    // Sync volume
    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = volume;
    }, [volume]);

    // ── Background pre-fetch: download ALL audio tracks in current playlist/channel ───────────
    // Triggers when slides array changes (new channel/playlist selected).
    // Downloads each HTTP audio track to IndexedDB so subsequent plays are instant & offline.
    // Rate-limited: 1 concurrent download, 2s gap between downloads to avoid hammering servers.
    const prefetchSlidesRef = useRef<string>(''); // tracks which slides array we're pre-fetching for
    useEffect(() => {
        if (slides.length === 0) return;
        const key = slides.map(s => s.id).join(',');
        if (prefetchSlidesRef.current === key) return; // already pre-fetching this exact list
        prefetchSlidesRef.current = key;

        const cacheable = slides.filter(t => {
            if (!t.audioUrl) return false;
            const u = t.audioUrl;
            if (u.startsWith('yt:') || u.startsWith('tt:') || u.startsWith('fb:') || u.startsWith('fbreel:') || u.startsWith('local:') || u.startsWith('asset:')) return false;
            return u.startsWith('http');
        });

        let aborted = false;
        let idx = 0;

        const fetchNext = async () => {
            if (aborted || idx >= cacheable.length) return;
            const t = cacheable[idx++];
            // Skip if already in IndexedDB
            const existing = await getAudioBlob(t.id);
            if (existing) {
                setSessionBlob(t.id, existing);
                setTimeout(fetchNext, 200); // fast-forward through already-cached
                return;
            }
            // Skip if already in session (downloaded this run)
            if (getSessionBlob(t.id)) {
                setTimeout(fetchNext, 200);
                return;
            }
            try {
                const resp = await fetch(t.audioUrl);
                if (resp.ok && !aborted) {
                    const blob = await resp.blob();
                    if (!aborted) {
                        setSessionBlob(t.id, blob);
                        void cacheAudioBlob(t.id, blob);
                    }
                }
            } catch { /* ignore — will retry on next play */ }
            // 2s gap between each background download to not interfere with user's connection
            setTimeout(fetchNext, 2000);
        };

        // Start background pre-fetch after a 3s delay (let current track init() finish first)
        const timer = setTimeout(fetchNext, 3000);
        return () => { aborted = true; clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slides]);

    // Sync play/pause. Call play() directly without waiting for AudioContext —
    // ctx.resume().then() is async and WKWebView may revoke autoplay permission in that gap.
    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        if (isPlaying) {
            void a.play()
                .then(() => setAutoplayBlocked(false))
                .catch((err: unknown) => {
                    const name = (err as { name?: string })?.name;
                    if (name === 'NotAllowedError') setAutoplayBlocked(true);
                });
            // Resume ctx separately for the visualizer (non-blocking)
            const ctx = getExistingAudioCtx();
            if (ctx && ctx.state !== 'running') ctx.resume().catch(() => { });
        } else {
            a.pause();
        }
    }, [isPlaying]);

    // Resume AudioContext on any user gesture (most reliable for WKWebView / Chrome)
    useEffect(() => {
        const handler = () => resumeVisualizerCtx();
        document.addEventListener('click', handler);
        document.addEventListener('touchstart', handler);
        return () => {
            document.removeEventListener('click', handler);
            document.removeEventListener('touchstart', handler);
        };
    }, []);

    // ── Media Session API (lock screen / notification controls) ────────────

    useEffect(() => {
        const track = slides[activeIndex];
        if (!track || !('mediaSession' in navigator)) return;

        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title || t('Nhạc không tên', 'Untitled', isVietnamese),
            artist: track.artist || 'WordAI Music',
            album: 'WordAI Music',
            artwork: track.thumbnailUrl
                ? [{ src: track.thumbnailUrl, sizes: '512x512', type: 'image/jpeg' }]
                : [],
        });

        // Use setActiveIndex directly — scrollIntoView won't work when app is backgrounded
        // (lock screen), so IntersectionObserver would never fire.
        const handlePrev = () => {
            const prevIdx = activeIndex - 1;
            if (prevIdx < 0) return;
            setActiveIndex(prevIdx);
            setIsPlaying(true);
            const container = feedRef.current;
            if (container) container.scrollTop = prevIdx * container.clientHeight;
        };
        const handleNext = () => {
            const nextIdx = activeIndex + 1 >= slides.length ? 0 : activeIndex + 1;
            setActiveIndex(nextIdx);
            setIsPlaying(true);
            const container = feedRef.current;
            if (container) container.scrollTop = nextIdx * container.clientHeight;
        };
        const handlePlay = () => {
            setIsPlaying(true);
            audioRef.current?.play().catch(() => null);
        };
        const handlePause = () => {
            setIsPlaying(false);
            audioRef.current?.pause();
        };

        navigator.mediaSession.setActionHandler('play', handlePlay);
        navigator.mediaSession.setActionHandler('pause', handlePause);
        navigator.mediaSession.setActionHandler('previoustrack', activeIndex > 0 ? handlePrev : null);
        navigator.mediaSession.setActionHandler('nexttrack', handleNext);

        // Keep lock screen play/pause icon in sync
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

        return () => {
            try {
                navigator.mediaSession.setActionHandler('play', null);
                navigator.mediaSession.setActionHandler('pause', null);
                navigator.mediaSession.setActionHandler('previoustrack', null);
                navigator.mediaSession.setActionHandler('nexttrack', null);
            } catch { /* not all browsers support this */ }
        };
    }, [activeIndex, slides, isPlaying, isVietnamese]);

    // ── Cover-based theme extraction ─────────────────────────────────────────

    useEffect(() => {
        const track = slides[activeIndex];
        if (!track?.thumbnailUrl) {
            // No cover → random theme based on track hash (don't override)
            setCoverThemeIdx(null);
            return;
        }
        const url = track.thumbnailUrl;
        // Return cached result immediately
        if (coverThemeCache.has(url)) {
            setCoverThemeIdx(coverThemeCache.get(url) ?? null);
            return;
        }
        // Async extraction
        void getImageThemeIndex(url).then(idx => {
            coverThemeCache.set(url, idx);
            setCoverThemeIdx(idx);
        });
    }, [activeIndex, slides]);

    // ── Global desktop YouTube iframe management ─────────────────────────────────────────────────────

    // Track main content area rect — used for fullscreen YouTube mode positioning.
    // Uses feedRef (the scrollable div INSIDE the lg:pl-[300px] wrapper) so the
    // bounding rect starts after the Music Library sidebar, not at the outer div edge.
    useEffect(() => {
        const getRect = () => {
            const el = feedRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            setMainContentRect({ left: r.left, top: r.top, width: r.width, height: r.height });
        };
        getRect();
        const ro = new ResizeObserver(getRect);
        if (feedRef.current) ro.observe(feedRef.current);
        window.addEventListener('resize', getRect);
        return () => { ro.disconnect(); window.removeEventListener('resize', getRect); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Reset full video mode: true (full) for YouTube only; Facebook defaults to card mode to keep name/controls visible below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        setYtFullMode(!!slides[activeIndex]?.youtubeId);
    }, [slides[activeIndex]?.youtubeId, slides[activeIndex]?.facebookId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Track active card's bounding rect for position:fixed iframe placement.
    // Runs after snap scroll settles so getBoundingClientRect() is accurate.
    useEffect(() => {
        const update = () => {
            const slideEl = slideRefs.current[activeIndex];
            if (!slideEl) { setDesktopCardRect(null); return; }
            const cardEl = slideEl.querySelector('[data-music-card]') as HTMLElement | null;
            if (!cardEl) { setDesktopCardRect(null); return; }
            const r = cardEl.getBoundingClientRect();
            setDesktopCardRect({ left: r.left, top: r.top, width: r.width, height: r.height });
        };
        const t = setTimeout(update, 120); // wait for snap scroll to settle
        window.addEventListener('resize', update);
        return () => { clearTimeout(t); window.removeEventListener('resize', update); };
    }, [activeIndex, slides.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Global desktop YouTube ended detection + video switching via postMessage.
    const activeSlideYoutubeId = slides[activeIndex]?.youtubeId;
    const activeSlideTrackId = slides[activeIndex]?.id;
    const activeSlideDuration = slides[activeIndex]?.durationSec;
    useEffect(() => {
        if (!activeSlideYoutubeId) return;
        const track = slides[activeIndex]!;
        setDesktopYtFading(false);
        setDesktopYtPlaying(false);
        desktopYtEndedFiredRef.current = false;

        // Initialize global iframe src on first YouTube track encounter
        if (!desktopGlobalYtId) setDesktopGlobalYtId(activeSlideYoutubeId);

        // Change video via postMessage (iframe stays in DOM → fullscreen persists)
        if (desktopLastLoadedYtIdRef.current && activeSlideYoutubeId !== desktopLastLoadedYtIdRef.current) {
            desktopLastLoadedYtIdRef.current = activeSlideYoutubeId;
            try {
                const win = desktopYtIframeRef.current?.contentWindow;
                if (win) win.postMessage(JSON.stringify({ event: 'command', func: 'loadVideoById', args: [activeSlideYoutubeId, 0] }), '*');
            } catch { }
        } else if (!desktopLastLoadedYtIdRef.current) {
            desktopLastLoadedYtIdRef.current = activeSlideYoutubeId;
        }

        // Auto-dismiss tap-to-play overlay
        if (desktopYtAutoDismissRef.current) clearTimeout(desktopYtAutoDismissRef.current);
        desktopYtAutoDismissRef.current = setTimeout(() => {
            setDesktopYtPlaying(true);
            try {
                const win = desktopYtIframeRef.current?.contentWindow;
                if (win) win.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
            } catch { }
        }, 1800);

        const triggerEnd = () => {
            if (desktopYtEndedFiredRef.current) return;
            desktopYtEndedFiredRef.current = true;
            setDesktopYtFading(true);
            desktopYtEndedTimerRef.current = setTimeout(() => {
                crossfadeAdvanceRef.current = true;
                advanceToNext();
            }, 600);
        };

        let ytDuration = track.durationSec > 0 ? track.durationSec : 0;
        const onMsg = (e: MessageEvent) => {
            const origin = String(e.origin);
            // Allow both youtube.com and youtube-nocookie.com origins
            if (!origin.includes('youtube.com') && !origin.includes('youtube-nocookie.com')) return;
            try {
                const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
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

                if (data?.event === 'onStateChange' && (data?.info === 0 || data?.info === '0')) { triggerEnd(); return; }
                if (data?.event === 'onStateChange' && (data?.info === 1 || data?.info === '1')) { setDesktopYtPlaying(true); return; }
                if (data?.event === 'infoDelivery' && data?.info) {
                    const info = data.info;
                    if (info.playerState === 0) { triggerEnd(); return; }
                    if (info.playerState === 1) setDesktopYtPlaying(true);
                    if (info.duration > 0 && info.duration !== ytDuration) {
                        ytDuration = info.duration;
                        // Reset fallback with the real duration now that we know it
                        clearTimeout(fallbackTimer);
                        fallbackTimer = setTimeout(triggerEnd, (ytDuration + 10) * 1000);
                    }
                    if (ytDuration > 0 && typeof info.currentTime === 'number' && info.currentTime >= ytDuration - 0.5) { triggerEnd(); return; }
                }
            } catch { }
        };
        window.addEventListener('message', onMsg);

        // Start with 5-min fallback for unknown-duration tracks; resets to ytDuration+10 when API reports real duration
        let fallbackTimer = setTimeout(triggerEnd, ytDuration > 10 ? (ytDuration + 10) * 1000 : 300_000);
        const pingInterval = setInterval(() => {
            try {
                const win = desktopYtIframeRef.current?.contentWindow;
                if (win) {
                    win.postMessage(JSON.stringify({ event: 'listening', id: track.id }), '*');
                    win.postMessage(JSON.stringify({ event: 'command', func: 'getVideoData', args: [] }), '*');
                }
            } catch { }
        }, 1000);

        return () => {
            window.removeEventListener('message', onMsg);
            if (desktopYtEndedTimerRef.current) clearTimeout(desktopYtEndedTimerRef.current);
            if (desktopYtAutoDismissRef.current) clearTimeout(desktopYtAutoDismissRef.current);
            clearTimeout(fallbackTimer);
            clearInterval(pingInterval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSlideYoutubeId, activeSlideTrackId, activeSlideDuration]);

    // ── Global desktop Facebook iframe management ────────────────────────────

    const activeSlideFacebookId = slides[activeIndex]?.facebookId;
    useEffect(() => {
        if (!activeSlideFacebookId) {
            setDesktopFbFading(true);
            const t = setTimeout(() => { setDesktopFbEmbedUrl(null); setDesktopFbFading(false); }, 600);
            return () => clearTimeout(t);
        }

        // If the gesture handler already loaded this fbId directly into the iframe, skip the src update
        // (changing src again would remount the FB player and lose the unmuted state).
        if (desktopFbCurrentIdRef.current !== activeSlideFacebookId) {
            const fbId = activeSlideFacebookId;
            const isReel = !!slides[activeIndex]?.facebookIsReel;
            const embedUrl = buildFbEmbedUrl(fbId, isReel, true /* muted — auto-advance, no gesture */);
            desktopFbCurrentIdRef.current = fbId;
            if (desktopFbIframeRef.current) desktopFbIframeRef.current.src = embedUrl;
            setDesktopFbEmbedUrl(embedUrl);
        }
        setDesktopFbFading(false);
        desktopFbEndedFiredRef.current = false;

        if (desktopFbEndedTimerRef.current) clearTimeout(desktopFbEndedTimerRef.current);

        const triggerFbEnd = () => {
            if (desktopFbEndedFiredRef.current) return;
            desktopFbEndedFiredRef.current = true;
            setDesktopFbFading(true);
            desktopFbEndedTimerRef.current = setTimeout(() => {
                crossfadeAdvanceRef.current = true;
                advanceToNext();
            }, 600);
        };

        // Listen for Facebook postMessage ended events (format varies by embed version — search all values)
        const onFbMessage = (e: MessageEvent) => {
            if (!String(e.origin).includes('facebook.com')) return;
            try {
                const raw = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
                if (/video[_:]end|finished.?playing|playback.?end|video.?ended/i.test(raw)) triggerFbEnd();
            } catch { }
        };
        window.addEventListener('message', onFbMessage);

        // Fallback timer: use track duration when known, otherwise 3 minutes
        const track = slides[activeIndex];
        const fallbackMs = (track?.durationSec ?? 0) > 10 ? ((track?.durationSec ?? 0) + 5) * 1000 : 3 * 60 * 1000;
        const fallbackTimer = setTimeout(triggerFbEnd, fallbackMs);

        return () => {
            window.removeEventListener('message', onFbMessage);
            clearTimeout(fallbackTimer);
            if (desktopFbEndedTimerRef.current) clearTimeout(desktopFbEndedTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSlideFacebookId]);

    // ── Channel switch ───────────────────────────────────────────────────────

    // Builds a FB embed URL. muted=0 requires a synchronous user-gesture context to play with sound.
    const buildFbEmbedUrl = useCallback((fbId: string, isReel: boolean, muted: boolean) => {
        const fbHref = isReel ? `https://www.facebook.com/reel/${fbId}` : `https://www.facebook.com/watch?v=${fbId}`;
        return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(fbHref)}&show_text=false&autoplay=1&muted=${muted ? '1' : '0'}&loop=0`;
    }, []);

    // Sets the FB iframe src directly via ref (synchronous — safe inside click handlers)
    // and updates React state so the overlay becomes visible.
    const setFbSrcDirectly = useCallback((fbId: string, isReel: boolean) => {
        const url = buildFbEmbedUrl(fbId, isReel, false /* unmuted — called from gesture context */);
        desktopFbCurrentIdRef.current = fbId;
        desktopFbEndedFiredRef.current = false;
        if (desktopFbIframeRef.current) desktopFbIframeRef.current.src = url;
        setDesktopFbEmbedUrl(url);
        setDesktopFbFading(false);
    }, [buildFbEmbedUrl]);

    const stopIframeMedia = useCallback(() => {
        // Stop YouTube iframe audio
        try {
            const win = desktopYtIframeRef.current?.contentWindow;
            if (win) win.postMessage(JSON.stringify({ event: 'command', func: 'stopVideo', args: [] }), '*');
        } catch { }
        setDesktopGlobalYtId(null);
        setDesktopYtFading(false);
        setDesktopYtPlaying(false);
        desktopLastLoadedYtIdRef.current = null;
        // Stop Facebook iframe audio
        desktopFbCurrentIdRef.current = null;
        setDesktopFbEmbedUrl(null);
        setDesktopFbFading(false);
    }, []);

    useEffect(() => {
        if (subTab === 'shorts') {
            setIsPlaying(false);
            stopIframeMedia();
            if (audioRef.current) { audioRef.current.pause(); }
        }
    }, [subTab, stopIframeMedia]);

    const handleSelectChannel = useCallback((slug: ChannelSlug) => {
        if (slug === selectedChannel) return;

        // Unlock audio contexts synchronously to satisfy Safari/WKWebView gesture requirements
        // BEFORE any async fetching or state batching drops the user interaction token.
        if (audioRef.current) {
            if (!audioRef.current.src) {
                audioRef.current.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
            }
            audioRef.current.play().catch(() => null);
        }

        stopIframeMedia();
        setSelectedChannel(slug);
        setCurrentTime(0);
        setDuration(0);
        saveLastCtx({ type: 'channel', slug });
        loadAndBuildSlides(slug, true);
    }, [selectedChannel, loadAndBuildSlides, stopIframeMedia]);

    // ── Like / Save ──────────────────────────────────────────────────────────

    const handleLike = useCallback((id: string) => {
        const newSet = toggleSetStorage('music_liked', id);
        setLikedIds(new Set(newSet));
    }, []);

    const handleSave = useCallback((id: string) => {
        setPlaylistPickerError('');
        setPlaylistPickerTrackId(prev => (prev === id ? null : id));
    }, []);

    const handleSaveToPlaylist = useCallback(async (track: SlideTrack | undefined, playlistId: string) => {
        if (!track) return;
        try {
            setPlaylistPickerError('');
            await addTrackToMusicPlaylist(playlistId, {
                id: track.id,
                title: track.title,
                artist: track.artist,
                audioUrl: track.audioUrl,
                durationSec: track.durationSec,
                source: track.source as 'youtube' | 'tiktok' | 'local',
                thumbnailUrl: track.thumbnailUrl,
            });
            await syncRemotePlaylists();
            setPlaylistPickerTrackId(null);
        } catch (error) {
            setPlaylistPickerError((error as Error).message || 'Failed to save track');
        }
    }, [syncRemotePlaylists]);

    const handleSeek = useCallback((time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    }, []);

    const handleShare = useCallback(() => {
        const track = slides[activeIndex];
        if (!track) return;
        const text = track.title ? `${track.title} — ${track.artist}` : 'WordAI Music';
        if (navigator.share) {
            navigator.share({ title: text, url: window.location.href }).catch(() => null);
        } else {
            navigator.clipboard?.writeText(window.location.href).catch(() => null);
        }
    }, [slides, activeIndex]);

    // ── Render ───────────────────────────────────────────────────────────────

    const activeSlide = slides[activeIndex];
    const _activeChannelMeta = MUSIC_CHANNELS.find(c => c.slug === (activeSlide?.channelSlug ?? selectedChannel))
        ?? (currentPlaylistName ? { ...PLAYLIST_META, name: currentPlaylistName, label: currentPlaylistName } : PLAYLIST_META);
    void _activeChannelMeta; // used by future code

    const handlePlayTracks = useCallback((tracks: SidebarTrack[], startIndex = 0, playlistId?: string, playlistName?: string) => {
        // Unlock audio context synchronously immediately on click
        if (tracks.length > 0 && tracks[startIndex]?.source !== 'youtube' && tracks[startIndex]?.source !== 'facebook') {
            if (audioRef.current) {
                if (!audioRef.current.src) {
                    audioRef.current.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
                }
                audioRef.current.play().catch(() => null);
            }
        }

        let actualTracks = tracks;
        if (startIndex > 0 && startIndex < tracks.length) {
            actualTracks = [...tracks.slice(startIndex), ...tracks.slice(0, startIndex)];
        }
        // Shuffle if enabled — always keep the first track (user's explicit selection) at position 0
        const orderedTracks = isShuffle
            ? [actualTracks[0], ...shuffleArr(actualTracks.slice(1))]
            : actualTracks;
        // Store full playlist for pagination; show only first MAX_SLIDES in the feed
        playlistAllTracksRef.current = orderedTracks;
        const newSlides: SlideTrack[] = orderedTracks.slice(0, MAX_SLIDES).map(t => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            audioUrl: t.audioUrl,
            durationSec: t.durationSec,
            source: t.source,
            channelSlug: 'playlist',
            thumbnailUrl: t.thumbnailUrl,
            youtubeId: t.youtubeId,
            tiktokId: t.tiktokId,
            facebookId: t.facebookId,
            facebookIsReel: t.facebookId ? (t.audioUrl.startsWith('fbreel:') ? true : undefined) : undefined,
        }));
        saveLastCtx({ type: 'playlist', id: playlistId ?? 'custom', name: playlistName ?? 'Playlist', tracks: orderedTracks.slice(0, 50) });

        stopIframeMedia();
        // If first track is Facebook, set iframe src synchronously inside this gesture handler
        // so the browser grants unmuted autoplay permission.
        if (newSlides[0]?.facebookId) {
            setFbSrcDirectly(newSlides[0].facebookId, !!newSlides[0].facebookIsReel);
        }
        // Prevent IntersectionObserver from interfering during slide array swap
        isSwitchingChannel.current = true;
        if (feedRef.current) feedRef.current.scrollTop = 0;
        slideRefs.current = [];
        setCurrentPlaylistName(playlistName ?? 'Playlist');
        setSlides(newSlides);
        setSelectedChannel('playlist' as ChannelSlug);
        setActiveIndex(0);
        setIsPlaying(true);
        setIsMenuOpen(false);
        setTimeout(() => {
            feedRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
            // Longer delay to let IO settle after slide array swap + scroll
            setTimeout(() => { isSwitchingChannel.current = false; }, 200);
        }, 80);
    }, [isShuffle, stopIframeMedia]);

    const loadChannelTracksForSidebar = useCallback(async (slug: string): Promise<SidebarTrack[]> => {
        const tracks = await loadChannel(slug);
        return tracks.map(t => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            audioUrl: t.audioUrl,
            durationSec: t.durationSec,
            source: t.source,
            thumbnailUrl: t.thumbnailUrl,
            youtubeId: t.youtubeId,
            tiktokId: t.tiktokId,
            facebookId: t.facebookId,
            facebookIsReel: t.facebookId ? (t.audioUrl.startsWith('fbreel:') ? true : undefined) : undefined,
        }));
    }, []);

    return (
        <>
            {/* CSS keyframes */}
            <style>{`
                @keyframes vinylSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes soundBar { from { opacity: 0.5; } to { opacity: 1; transform: scaleY(1.3); } }
                @keyframes ambientPulse { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.04); } }
                @keyframes videoIconPop{0%{opacity:1;transform:scale(0.6)}40%{opacity:1;transform:scale(1.15)}70%{opacity:1;transform:scale(0.95)}100%{opacity:0;transform:scale(1)}}
            `}</style>

            {/* Music library sidebar */}
            <MusicSidebar
                isOpen={isMenuOpen}
                onClose={() => setIsMenuOpen(false)}
                channels={MUSIC_CHANNELS.map(ch => ({ slug: ch.slug, name: ch.name, label: ch.label, accent: ch.accent }))}
                selectedChannelSlug={selectedChannel}
                onSelectChannel={slug => {
                    const ch = MUSIC_CHANNELS.find(c => c.slug === slug);
                    if (ch) handleSelectChannel(ch.slug);
                    else handleSelectChannel(slug as ChannelSlug);
                }}
                onPlayTracks={handlePlayTracks}
                onLoadChannelTracks={loadChannelTracksForSidebar}
                isDark={isDark}
                isVietnamese={isVietnamese}
                desktopPinned
                leftOffset={0}
                topOffset={72}
                currentTrackId={activeSlide?.id}
                isShuffle={isShuffle}
                onToggleShuffle={() => setIsShuffle(v => { saveShuffleState(!v); return !v; })}
                onOpenShorts={() => setSubTab('shorts')}
                isShortsActive={subTab === 'shorts'}
            />

            {subTab === 'shorts' && (
                <div className="h-full flex lg:pl-[320px]">
                    <div className="flex-1 overflow-hidden relative z-[50] bg-[#06060f]">
                        {/* Back button */}
                        <button
                            onClick={() => setSubTab('library')}
                            className="absolute top-4 right-4 z-[60] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white/80 text-xs font-medium hover:bg-white/10 transition-colors"
                            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                        >
                            ✕ {isVietnamese ? 'Đóng' : 'Close'}
                        </button>
                        <YoutubeShortsFeedClient />
                    </div>
                </div>
            )}

            {/* Main content wrapper: music sidebar (320 px default) on lg+, track list (256 px) on xl+ */}
            <div className={`h-full flex lg:pl-[320px] ${subTab === 'shorts' ? 'hidden' : ''}`}>

                {/* Scrollable feed */}
                <div
                    ref={feedRef}
                    className="flex-1 overflow-y-scroll snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                    {isLoading && slides.length === 0 ? (
                        <div className="h-full flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-14 h-14 rounded-full border-4 border-white/10 border-t-indigo-500 animate-spin" />
                                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {t('Đang tải nhạc…', 'Loading music…', isVietnamese)}
                                </p>
                            </div>
                        </div>
                    ) : (
                        slides.map((slide, i) => {
                            const chMeta = MUSIC_CHANNELS.find(c => c.slug === slide.channelSlug)
                                ?? (slide.channelSlug === 'playlist' && currentPlaylistName ? { ...PLAYLIST_META, name: currentPlaylistName, label: currentPlaylistName } : PLAYLIST_META);
                            const isActive = i === activeIndex;
                            const trackId = slide.id;

                            return (
                                <div
                                    key={`${slide.channelSlug}-${slide.id}-${i}`}
                                    ref={el => { slideRefs.current[i] = el; }}
                                    className="h-full flex-shrink-0 snap-start relative"
                                >
                                    <MusicSection
                                        slide={slide}
                                        channelMeta={chMeta}
                                        isActive={isActive}
                                        isDark={isDark}
                                        isVietnamese={isVietnamese}
                                        isLiked={likedIds.has(trackId)}
                                        isSaved={savedIds.has(trackId)}
                                        isPlaying={isActive ? isPlaying : false}
                                        onTogglePlay={() => setIsPlaying(p => !p)}
                                        volume={volume}
                                        onVolumeChange={setVolume}
                                        currentTime={isActive ? currentTime : 0}
                                        duration={isActive ? duration : slide.durationSec}
                                        downloadProgress={isActive ? downloadProgress : null}
                                        onLike={() => handleLike(trackId)}
                                        onSave={() => handleSave(trackId)}
                                        onShare={handleShare}
                                        onMenuOpen={() => setIsMenuOpen(true)}
                                        likesCount={0}
                                        savesCount={0}
                                        slides={isActive ? slides : []}
                                        activeIndex={activeIndex}
                                        onSeek={handleSeek}
                                        nearbyTracks={isActive ? slides.slice(i, Math.min(i + 3, slides.length)) : []}
                                        coverThemeIdx={isActive ? coverThemeIdx : undefined}
                                        audioEl={isActive ? audioEl : undefined}
                                        onYouTubeEnded={isActive ? () => {
                                            // TikTok tracks call this via their ended timer.
                                            // YouTube ended is handled by the global desktopYt effect.
                                            crossfadeAdvanceRef.current = true;
                                            advanceToNext();
                                        } : undefined}
                                        onJumpToSlide={(idx) => {
                                            const container = feedRef.current;
                                            if (!container) return;
                                            isSwitchingChannel.current = true;
                                            setActiveIndex(idx);
                                            setIsPlaying(true); // ensure audio starts on click
                                            container.scrollTop = idx * container.clientHeight;
                                            setTimeout(() => { isSwitchingChannel.current = false; }, 300);
                                        }}
                                    />
                                </div>
                            );
                        })
                    )}
                </div>{/* end scrollable feed */}
            </div>{/* end content wrapper */}

            {/* Global Desktop YouTube Iframe — Video Pooling Pattern */}
            {/* position:fixed over the card so the DOM element is NEVER removed from page. */}
            {/* Track changes use postMessage loadVideoById — fullscreen persists across auto-advances. */}
            {desktopGlobalYtId && (ytFullMode ? mainContentRect : desktopCardRect) && (
                <div
                    className={`transition-opacity duration-[600ms] ${activeSlide?.youtubeId && !desktopYtFading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    style={{
                        position: 'fixed',
                        left: ytFullMode ? mainContentRect!.left : desktopCardRect!.left,
                        top: ytFullMode ? mainContentRect!.top : desktopCardRect!.top + 88,
                        width: ytFullMode ? mainContentRect!.width : desktopCardRect!.width,
                        height: ytFullMode ? mainContentRect!.height : Math.max(0, desktopCardRect!.height - 88 - 130),
                        zIndex: 20,
                    }}
                    onClick={e => e.stopPropagation()}
                    onWheel={e => { if (ytFullMode) feedRef.current?.scrollBy({ top: e.deltaY, behavior: 'smooth' }); }}
                >
                    <iframe
                        ref={desktopYtIframeRef}
                        src={`https://www.youtube-nocookie.com/embed/${desktopGlobalYtId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(ytEmbedOrigin)}`}
                        className="w-full h-full"
                        style={{ border: 'none' }}
                        allow="autoplay; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                        onLoad={(e) => {
                            try {
                                const win = e.currentTarget.contentWindow;
                                if (win) {
                                    win.postMessage(JSON.stringify({ event: 'listening' }), '*');
                                    win.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
                                }
                            } catch { }
                        }}
                    />
                    {!desktopYtPlaying && activeSlide?.youtubeId && (
                        <div
                            className="absolute inset-0 z-20 flex items-center justify-center cursor-pointer"
                            style={{ background: 'rgba(0,0,0,0.25)' }}
                            onClick={() => {
                                try {
                                    const win = desktopYtIframeRef.current?.contentWindow;
                                    if (win) win.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
                                } catch { }
                                setDesktopYtPlaying(true);
                            }}
                        >
                            <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20">
                                <Play className="w-7 h-7 text-white ml-1" />
                            </div>
                        </div>
                    )}

                    {/* Maximize to full video mode button (card mode only) */}
                    {!ytFullMode && activeSlide?.youtubeId && (
                        <button
                            className="absolute top-3 right-3 z-30 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors border border-white/15"
                            onClick={() => setYtFullMode(true)}
                        >
                            <Maximize2 className="w-4 h-4" />
                        </button>
                    )}

                    {/* Fullscreen mode UI: minimize button + bottom info/action overlay */}
                    {ytFullMode && activeSlide?.youtubeId && (
                        <>
                            <button
                                className="absolute top-4 left-4 z-30 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors border border-white/15"
                                onClick={() => setYtFullMode(false)}
                            >
                                <Minimize2 className="w-4 h-4" />
                            </button>
                            <div
                                className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none"
                                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 55%, transparent 100%)', padding: '56px 24px 24px' }}
                            >
                                <div className="flex items-end justify-between">
                                    <div className="flex-1 min-w-0 mr-4">
                                        <p className="text-white font-bold text-xl leading-tight truncate drop-shadow">{activeSlide.title}</p>
                                        {activeSlide.artist && <p className="text-white/65 text-sm mt-1 truncate">{activeSlide.artist}</p>}
                                    </div>
                                    <div className="pointer-events-auto flex items-center gap-3 flex-shrink-0">
                                        <button onClick={() => handleLike(activeSlide.id)}>
                                            <div className={`w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10 transition-colors ${likedIds.has(activeSlide.id) ? 'text-red-400' : 'text-white'}`}>
                                                <Heart className="w-5 h-5" fill={likedIds.has(activeSlide.id) ? 'currentColor' : 'none'} />
                                            </div>
                                        </button>
                                        <button onClick={() => handleSave(activeSlide.id)}>
                                            <div className={`w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10 transition-colors ${savedIds.has(activeSlide.id) ? 'text-yellow-400' : 'text-white'}`}>
                                                {savedIds.has(activeSlide.id) ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Global Desktop Facebook Iframe */}
            {desktopFbEmbedUrl && (
                <div
                    className={`transition-opacity duration-[600ms] ${activeSlide?.facebookId && !desktopFbFading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    style={{
                        position: 'fixed',
                        left: (ytFullMode ? mainContentRect?.left : desktopCardRect?.left) ?? 0,
                        top: ytFullMode ? (mainContentRect?.top ?? 0) : ((desktopCardRect?.top ?? 0) + 88),
                        width: (ytFullMode ? mainContentRect?.width : desktopCardRect?.width) ?? window.innerWidth,
                        height: ytFullMode ? (mainContentRect?.height ?? window.innerHeight) : Math.max(0, (desktopCardRect?.height ?? window.innerHeight) - 88 - 130),
                        zIndex: 20,
                        background: '#000',
                    }}
                    onClick={e => e.stopPropagation()}
                    onWheel={e => { if (ytFullMode) feedRef.current?.scrollBy({ top: e.deltaY, behavior: 'smooth' }); }}
                >
                    <iframe
                        ref={desktopFbIframeRef}
                        src={desktopFbEmbedUrl ?? undefined}
                        className="w-full h-full"
                        style={{ border: 'none' }}
                        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                        allowFullScreen
                        scrolling="no"
                    />
                    {/* Fullscreen info overlay */}
                    {ytFullMode && activeSlide?.facebookId && (
                        <>
                            <button
                                className="absolute top-4 left-4 z-30 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors border border-white/15"
                                onClick={() => setYtFullMode(false)}
                            >
                                <Minimize2 className="w-4 h-4" />
                            </button>
                            <div
                                className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none"
                                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 55%, transparent 100%)', padding: '56px 24px 24px' }}
                            >
                                <div className="flex items-end justify-between">
                                    <div className="flex-1 min-w-0 mr-4">
                                        <p className="text-white font-bold text-xl leading-tight truncate drop-shadow">{activeSlide.title}</p>
                                        {activeSlide.artist && <p className="text-white/65 text-sm mt-1 truncate">{activeSlide.artist}</p>}
                                    </div>
                                    <div className="pointer-events-auto flex items-center gap-3 flex-shrink-0">
                                        <button onClick={() => handleLike(activeSlide.id)}>
                                            <div className={`w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10 transition-colors ${likedIds.has(activeSlide.id) ? 'text-red-400' : 'text-white'}`}>
                                                <Heart className="w-5 h-5" fill={likedIds.has(activeSlide.id) ? 'currentColor' : 'none'} />
                                            </div>
                                        </button>
                                        <button onClick={() => handleSave(activeSlide.id)}>
                                            <div className={`w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10 transition-colors ${savedIds.has(activeSlide.id) ? 'text-yellow-400' : 'text-white'}`}>
                                                {savedIds.has(activeSlide.id) ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                    {/* Card-mode maximize button */}
                    {!ytFullMode && activeSlide?.facebookId && (
                        <button
                            className="absolute top-3 right-3 z-30 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors border border-white/15"
                            onClick={() => setYtFullMode(true)}
                        >
                            <Maximize2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            )}

            {/* Mobile tap-to-unmute hint */}
            {autoplayBlocked && (
                <div
                    className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9990] lg:hidden pointer-events-auto"
                    onClick={() => {
                        setIsPlaying(true);
                        audioRef.current?.play().then(() => setAutoplayBlocked(false)).catch(() => null);
                    }}
                >
                    <div className="flex items-center gap-2 rounded-full bg-black/70 backdrop-blur-md px-5 py-2.5 text-white text-sm font-medium shadow-xl ring-1 ring-white/10 cursor-pointer active:scale-95 transition-transform">
                        <Volume2 className="w-4 h-4 text-indigo-400" />
                        {t('Chạm để bật âm thanh', 'Tap to unmute', isVietnamese)}
                    </div>
                </div>
            )}

            {/* Playlist picker popup (portal) */}
            {playlistPickerTrackId && typeof window !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-[9995] flex items-end justify-center sm:items-center p-4"
                    onClick={() => setPlaylistPickerTrackId(null)}
                >
                    <div
                        className={`w-full max-w-sm rounded-2xl shadow-2xl flex flex-col overflow-hidden ${isDark ? 'bg-gray-900 ring-1 ring-white/10' : 'bg-white ring-1 ring-gray-200'}`}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                            <div className="flex items-center gap-2">
                                <ListMusic className="w-4 h-4 text-indigo-400" />
                                <span className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    {t('Lưu vào Playlist', 'Save to Playlist', isVietnamese)}
                                </span>
                            </div>
                            <button onClick={() => setPlaylistPickerTrackId(null)} className={`p-1 rounded-md ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        {playlistPickerError && (
                            <div className={`mx-5 mt-4 rounded-2xl px-4 py-3 text-xs ${isDark ? 'bg-rose-500/10 text-rose-200 border border-rose-400/20' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
                                {playlistPickerError}
                            </div>
                        )}
                        {/* Playlists */}
                        {(() => {
                            if (playlistPickerLoading) {
                                return (
                                    <div className="flex justify-center py-8">
                                        <ListMusic className={`w-5 h-5 animate-pulse ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                                    </div>
                                );
                            }

                            if (playlistOptions.length === 0) {
                                return (
                                    <div className={`px-5 py-4 text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                        {t('Chưa có playlist nào. Tạo playlist trong thư viện nhạc.', 'No playlists yet. Create one in the music library.', isVietnamese)}
                                    </div>
                                );
                            }
                            return playlistOptions.map(pl => (
                                <button
                                    key={pl.id}
                                    onClick={() => {
                                        const track = slides.find(s => s.id === playlistPickerTrackId);
                                        void handleSaveToPlaylist(track, pl.id);
                                    }}
                                    className={`flex items-center gap-3 px-5 py-3.5 text-sm transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-50 text-gray-700'}`}
                                >
                                    <Plus className="w-4 h-4 text-emerald-400" />
                                    <div className="text-left flex-1 min-w-0">
                                        <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{pl.name}</p>
                                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{pl.tracks.length} {t('bài', 'tracks', isVietnamese)}</p>
                                    </div>
                                </button>
                            ));
                        })()}
                        <div className="h-4" />
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
