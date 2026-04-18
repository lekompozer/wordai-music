'use client';

/**
 * MusicPlayerMobile — Mobile-optimized audio engine
 *
 * KEY DIFFERENCE vs MusicPlayerClient (desktop):
 *   Desktop: creates new Audio() per track in useEffect → fine on desktop
 *   Mobile:  SINGLE <audio> element, never recreated.
 *            When track ends → swap .src IMMEDIATELY → .play() → zero gap.
 *            iOS/Android won't drop the audio session because <audio> never
 *            stops being "active" between tracks.
 *
 * Pattern (from docs/WordAI Music/Phân tích mobile.md):
 *   1. While track A plays → store next track URL in prefetchRef (just a string)
 *   2. `ended` fires → audio.src = prefetchedUrl → audio.play() → setActiveIndex()
 *      (audio already running BEFORE React re-renders)
 *   3. Lock-screen buttons work because MediaSession handlers call setActiveIndex,
 *      which triggers step 2 above (srcSetByEndedRef skipped, direct swap used)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Music2, Heart, Bookmark, BookmarkCheck, Share2,
    Volume2, VolumeX, Menu, Plus, X, ListMusic, Play, Pause,
} from 'lucide-react';
import { useTheme, useLanguage } from '@/contexts/AppContext';
import { useWordaiAuth } from '@/contexts/WordaiAuthContext';
import MusicSidebar, { type SidebarTrack } from './MusicSidebar';
import { getAudioBlob, getSessionBlob, setSessionBlob } from '@/lib/audioCache';
import {
    MUSIC_PLAYLISTS_UPDATED_EVENT,
    addTrackToMusicPlaylist,
    getMusicPlaylists,
    type MusicPlaylist,
} from '@/services/musicPlaylistService';

function t(vi: string, en: string, isVietnamese: boolean) { return isVietnamese ? vi : en; }

// ─── Channel config ───────────────────────────────────────────────────────────

const MUSIC_CHANNELS = [
    { slug: 'background-music', name: 'Background Music', label: 'm/background-music', accent: '#4f46e5' },
    { slug: 'nhac-hot-tiktok', name: 'Nhạc Hot TikTok', label: 'm/nhac-hot-tiktok', accent: '#2563eb' },
    { slug: 'nhacviet-tiktok', name: 'Nhạc Việt', label: 'm/nhacviet-tiktok', accent: '#0f766e' },
    { slug: 'rap-tiktok', name: 'Rap TikTok', label: 'm/rap-tiktok', accent: '#7c3aed' },
    { slug: 'nhac-soi-dong', name: 'Nhạc Sôi Động', label: 'm/nhac-soi-dong', accent: '#1d4ed8' },
    { slug: 'nhac-en-chill', name: 'Nhạc Chill', label: 'm/nhac-en-chill', accent: '#4338ca' },
] as const;

type ChannelSlug = typeof MUSIC_CHANNELS[number]['slug'] | 'playlist' | (string & {});
const PLAYLIST_META = { slug: 'playlist' as const, name: 'My Playlist', label: 'pl/playlist', accent: '#4338ca' };
type AnyChannelMeta = { slug: string; name: string; label: string; accent: string };

// ─── Types ────────────────────────────────────────────────────────────────────

interface Track {
    id: string; title: string; artist: string;
    audioUrl: string; durationSec: number; source: string; thumbnailUrl?: string;
    youtubeId?: string; tiktokId?: string; facebookId?: string; facebookIsReel?: boolean;
}
interface SlideTrack extends Track { channelSlug: ChannelSlug; }

// ─── localStorage helpers ─────────────────────────────────────────────────────

const LAST_CTX_KEY = 'music_last_ctx';
type LastCtx = { type: 'channel'; slug: ChannelSlug } | { type: 'playlist'; id: string; name: string; tracks: SidebarTrack[] };
function saveLastCtx(ctx: LastCtx) { try { localStorage.setItem(LAST_CTX_KEY, JSON.stringify(ctx)); } catch { /* quota */ } }
function loadLastCtx(): LastCtx | null { try { const r = localStorage.getItem(LAST_CTX_KEY); return r ? JSON.parse(r) as LastCtx : null; } catch { return null; } }

const SHUFFLE_KEY = 'music_shuffle';
function loadShuffleState() { try { return localStorage.getItem(SHUFFLE_KEY) !== 'false'; } catch { return true; } }
function saveShuffleState(v: boolean) { try { localStorage.setItem(SHUFFLE_KEY, v ? 'true' : 'false'); } catch { /* quota */ } }

function getLiked(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem('music_liked') || '[]')); } catch { return new Set(); } }
function getSaved(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem('music_saved') || '[]')); } catch { return new Set(); } }
function toggleSetStorage(key: string, id: string): Set<string> {
    const s = key === 'music_liked' ? getLiked() : getSaved();
    if (s.has(id)) s.delete(id); else s.add(id);
    localStorage.setItem(key, JSON.stringify([...s]));
    return s;
}

// ─── Queue helpers ────────────────────────────────────────────────────────────

function getStoredQueue(slug: string): string[] { try { return JSON.parse(localStorage.getItem(`mq_${slug}`) || '[]'); } catch { return []; } }
function saveQueue(slug: string, ids: string[]) { try { localStorage.setItem(`mq_${slug}`, JSON.stringify(ids)); } catch { /* quota */ } }
function getStoredPlayed(slug: string): string[] { try { return JSON.parse(localStorage.getItem(`mp_${slug}`) || '[]'); } catch { return []; } }
function addPlayed(slug: string, id: string) {
    const p = getStoredPlayed(slug); p.push(id);
    try { localStorage.setItem(`mp_${slug}`, JSON.stringify(p.slice(-1000))); } catch { /* quota */ }
}
function shuffleArr<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j]!, a[i]!]; }
    return a;
}
function popTracks(slug: string, allTracks: Track[], n: number): Track[] {
    let q = getStoredQueue(slug);
    if (q.length < n) {
        const playedSet = new Set(getStoredPlayed(slug));
        let unplayed = allTracks.filter(tr => !playedSet.has(tr.id));
        if (unplayed.length === 0) { localStorage.removeItem(`mp_${slug}`); unplayed = [...allTracks]; }
        q = [...q, ...shuffleArr(unplayed).map(tr => tr.id)];
        saveQueue(slug, q);
    }
    const taken = q.slice(0, n); saveQueue(slug, q.slice(n));
    taken.forEach(id => addPlayed(slug, id));
    const map = new Map(allTracks.map(tr => [tr.id, tr]));
    return taken.map(id => map.get(id)).filter(Boolean) as Track[];
}

// ─── Channel data fetching ────────────────────────────────────────────────────

const channelCache: Record<string, Track[]> = {};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadChannel(slug: string): Promise<Track[]> {
    if (channelCache[slug]) return channelCache[slug]!;
    try {
        if (UUID_RE.test(slug)) {
            const res = await fetch(`https://db-wordai-community.hoangnguyen358888.workers.dev/api/music/channel-tracks/${slug}`);
            if (!res.ok) return [];
            const data = await res.json() as { tracks?: Record<string, unknown>[] };
            const tracks: Track[] = (data.tracks ?? []).map((tr) => {
                const audioUrl = ((tr.audioUrl ?? tr.audio_url) ?? '') as string;
                const youtubeId = ((tr as any).youtubeId ?? (audioUrl.startsWith('yt:') ? audioUrl.slice(3) : undefined)) as string | undefined;
                const tiktokId = ((tr as any).tiktokId ?? (audioUrl.startsWith('tt:') ? audioUrl.slice(3) : undefined)) as string | undefined;
                const facebookId = ((tr as any).facebookId ?? (audioUrl.startsWith('fbreel:') ? audioUrl.slice(7) : audioUrl.startsWith('fb:') ? audioUrl.slice(3) : undefined)) as string | undefined;
                const facebookIsReel = audioUrl.startsWith('fbreel:') ? true : undefined;
                return {
                    id: (tr.id ?? tr.track_id) as string,
                    title: tr.title as string,
                    artist: (tr.artist ?? '') as string,
                    audioUrl,
                    durationSec: (tr.durationSec ?? tr.duration_sec ?? 0) as number,
                    source: (tr.source ?? 'youtube') as string,
                    thumbnailUrl: (tr.thumbnailUrl ?? tr.thumbnail_url) as string | undefined,
                    youtubeId,
                    tiktokId,
                    facebookId,
                    facebookIsReel,
                };
            });
            channelCache[slug] = tracks; return tracks;
        }
        const res = await fetch(`/data/music/${slug}.json`);
        if (!res.ok) return [];
        const data = await res.json() as { tracks?: Record<string, unknown>[] };
        const tracks: Track[] = (data.tracks || []).map((tr) => {
            const audioUrl = (tr.audioUrl ?? '') as string;
            const youtubeId = ((tr.youtubeId as string | undefined) ?? (audioUrl.startsWith('yt:') ? audioUrl.slice(3) : undefined));
            const tiktokId = ((tr.tiktokId as string | undefined) ?? (audioUrl.startsWith('tt:') ? audioUrl.slice(3) : undefined));
            const facebookId = ((tr.facebookId as string | undefined) ?? (audioUrl.startsWith('fbreel:') ? audioUrl.slice(7) : audioUrl.startsWith('fb:') ? audioUrl.slice(3) : undefined));
            const facebookIsReel = audioUrl.startsWith('fbreel:') ? true : undefined;
            return {
                ...tr,
                thumbnailUrl: (tr.thumbnailUrl ?? tr.coverUrl) as string | undefined,
                youtubeId,
                tiktokId,
                facebookId,
                facebookIsReel,
            };
        }) as unknown as Track[];
        channelCache[slug] = tracks; return tracks;
    } catch { return []; }
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtTime(sec: number): string {
    if (!sec || sec <= 0) return '';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
function fmtCount(n: number) { if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'; return String(n); }
void fmtCount; // used conditionally

// ─── Visual themes ────────────────────────────────────────────────────────────

const TRACK_THEMES = [
    // 1 — Indigo
    { accent: '#4f46e5', bg: 'radial-gradient(ellipse at 18% 16%, rgba(79,70,229,0.34) 0%, transparent 42%), radial-gradient(ellipse at 84% 78%, rgba(37,99,235,0.24) 0%, transparent 44%), linear-gradient(145deg, #060816 0%, #101935 52%, #050814 100%)' },
    // 2 — Blue
    { accent: '#2563eb', bg: 'radial-gradient(ellipse at 18% 20%, rgba(37,99,235,0.34) 0%, transparent 42%), radial-gradient(ellipse at 80% 84%, rgba(14,165,233,0.22) 0%, transparent 44%), linear-gradient(145deg, #04101f 0%, #0f1f3a 52%, #050915 100%)' },
    // 3 — Violet
    { accent: '#7c3aed', bg: 'radial-gradient(ellipse at 22% 18%, rgba(124,58,237,0.34) 0%, transparent 42%), radial-gradient(ellipse at 84% 76%, rgba(59,130,246,0.18) 0%, transparent 40%), linear-gradient(145deg, #090915 0%, #1a1433 52%, #050814 100%)' },
    // 4 — Teal
    { accent: '#0f766e', bg: 'radial-gradient(ellipse at 20% 18%, rgba(15,118,110,0.34) 0%, transparent 42%), radial-gradient(ellipse at 82% 76%, rgba(79,70,229,0.2) 0%, transparent 44%), linear-gradient(145deg, #041111 0%, #0d2329 52%, #060814 100%)' },
    // 5 — Navy blue
    { accent: '#1d4ed8', bg: 'radial-gradient(ellipse at 22% 22%, rgba(29,78,216,0.34) 0%, transparent 42%), radial-gradient(ellipse at 80% 78%, rgba(99,102,241,0.2) 0%, transparent 44%), linear-gradient(145deg, #040913 0%, #10203b 52%, #050814 100%)' },
    // 6 — Rose
    { accent: '#e11d48', bg: 'radial-gradient(ellipse at 20% 16%, rgba(225,29,72,0.32) 0%, transparent 42%), radial-gradient(ellipse at 82% 78%, rgba(124,58,237,0.2) 0%, transparent 44%), linear-gradient(145deg, #150610 0%, #2a0d1a 52%, #080510 100%)' },
    // 7 — Orange
    { accent: '#ea580c', bg: 'radial-gradient(ellipse at 20% 18%, rgba(234,88,12,0.32) 0%, transparent 42%), radial-gradient(ellipse at 80% 80%, rgba(202,138,4,0.18) 0%, transparent 44%), linear-gradient(145deg, #150904 0%, #291405 52%, #090805 100%)' },
    // 8 — Green
    { accent: '#16a34a', bg: 'radial-gradient(ellipse at 20% 18%, rgba(22,163,74,0.32) 0%, transparent 42%), radial-gradient(ellipse at 80% 78%, rgba(15,118,110,0.2) 0%, transparent 44%), linear-gradient(145deg, #041109 0%, #0c2214 52%, #050b07 100%)' },
    // 9 — Cyan
    { accent: '#0891b2', bg: 'radial-gradient(ellipse at 18% 18%, rgba(8,145,178,0.32) 0%, transparent 42%), radial-gradient(ellipse at 84% 76%, rgba(37,99,235,0.2) 0%, transparent 44%), linear-gradient(145deg, #041018 0%, #0d2030 52%, #050a14 100%)' },
    // 10 — Fuchsia
    { accent: '#a21caf', bg: 'radial-gradient(ellipse at 22% 18%, rgba(162,28,175,0.32) 0%, transparent 42%), radial-gradient(ellipse at 80% 78%, rgba(79,70,229,0.2) 0%, transparent 44%), linear-gradient(145deg, #0f0514 0%, #200a28 52%, #09050e 100%)' },
    // 11 — Grape
    { accent: '#6d28d9', bg: 'radial-gradient(ellipse at 18% 20%, rgba(109,40,217,0.34) 0%, transparent 42%), radial-gradient(ellipse at 82% 80%, rgba(162,28,175,0.18) 0%, transparent 44%), linear-gradient(145deg, #09071a 0%, #18102e 52%, #07051a 100%)' },
    // 12 — Slate
    { accent: '#475569', bg: 'radial-gradient(ellipse at 20% 18%, rgba(71,85,105,0.4) 0%, transparent 42%), radial-gradient(ellipse at 80% 76%, rgba(79,70,229,0.16) 0%, transparent 44%), linear-gradient(145deg, #070b12 0%, #111927 52%, #060a10 100%)' },
];

// ─── Dominant colour → nearest theme (same logic as desktop) ─────────────────

const THEME_ACCENT_HUES: [number, number][] = [
    [247, 0], [217, 1], [263, 2], [174, 3],
    [222, 4], [345, 5], [22, 6], [142, 7],
    [192, 8], [292, 9], [271, 10], [215, 11],
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
        canvas.width = 24; canvas.height = 24;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, 24, 24);
        const data = ctx.getImageData(0, 0, 24, 24).data;
        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const sat = max === 0 ? 0 : (max - min) / max;
            if (sat > 0.18 && max > 30) { sumR += r; sumG += g; sumB += b; count++; }
        }
        if (count < 5) return null;
        const hue = rgbToHue(sumR / count, sumG / count, sumB / count);
        return dominantHueToThemeIndex(hue);
    } catch { return null; }
}

const coverThemeCache = new Map<string, number | null>();

function getTrackTheme(track: SlideTrack, fallbackAccent: string, coverThemeIdx?: number | null) {
    if (coverThemeIdx != null && coverThemeIdx >= 0 && coverThemeIdx < TRACK_THEMES.length) {
        const t = TRACK_THEMES[coverThemeIdx]!;
        return { accent: t.accent, background: t.bg };
    }
    let hash = 0;
    const key = `${track.id}:${track.title}:${track.artist}`;
    for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    const theme = TRACK_THEMES[Math.abs(hash) % TRACK_THEMES.length]!;
    return { accent: theme.accent ?? fallbackAccent, background: theme.bg };
}

// ─── VinylDisc ────────────────────────────────────────────────────────────────

function VinylDisc({ isSpinning, accent, thumbnailUrl }: { isSpinning: boolean; accent: string; thumbnailUrl?: string }) {
    return (
        <div
            className="relative w-44 h-44 rounded-full shadow-[0_0_80px_rgba(0,0,0,0.8)] flex items-center justify-center select-none overflow-hidden"
            style={{
                background: thumbnailUrl
                    ? `url(${thumbnailUrl}) center/cover no-repeat`
                    : `radial-gradient(circle at 35% 35%, #2d2d2d, #111)`,
                animation: isSpinning ? 'vinylSpin 10s linear infinite' : 'none',
                border: '3px solid rgba(255,255,255,0.08)',
                WebkitMaskImage: '-webkit-radial-gradient(circle, white 100%, black 100%)',
                maskImage: 'radial-gradient(circle, white 100%, black 100%)',
            }}
        >
            {[60, 80, 100, 120, 140].map(r => (
                <div key={r} className="absolute rounded-full border border-white/[0.06]" style={{ width: r, height: r }} />
            ))}
            {thumbnailUrl
                ? <div className="relative w-3 h-3 rounded-full bg-black/80 z-10" />
                : <div className="relative w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: 'radial-gradient(circle, #1a1a1a, #0a0a0a)', border: '2px solid rgba(255,255,255,0.1)' }}>
                    <div className="w-8 h-8 rounded-full"
                        style={{ background: `radial-gradient(circle at 40% 40%, ${accent}40, ${accent}15)`, border: `1.5px solid ${accent}50` }} />
                </div>
            }
        </div>
    );
}

// ─── SoundBars ────────────────────────────────────────────────────────────────

function SoundBars({ playing }: { playing: boolean }) {
    const heights = [4, 7, 10, 6, 9, 5, 8, 4, 6, 7, 5];
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

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_LOAD = 8;
const LOAD_MORE_BATCH = 5;
const MAX_SLIDES = 30;

// ─── Component ────────────────────────────────────────────────────────────────

export default function MusicPlayerMobile() {
    const { isDark } = useTheme();
    const { isVietnamese } = useLanguage();
    const { user } = useWordaiAuth();

    // ── UI state ─────────────────────────────────────────────────────────────
    const [selectedChannel, setSelectedChannel] = useState<ChannelSlug>(() => {
        if (typeof window === 'undefined') return 'background-music';
        const ctx = loadLastCtx();
        return ctx?.type === 'channel' ? ctx.slug : 'background-music';
    });
    const [slides, setSlides] = useState<SlideTrack[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);  // false until first user gesture
    const [coverThemeIdx, setCoverThemeIdx] = useState<number | null>(null);
    const [volume, setVolume] = useState(1);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [likedIds, setLikedIds] = useState<Set<string>>(() => {
        if (typeof window === 'undefined') return new Set();
        return getLiked();
    });
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
    const [playlistOptions, setPlaylistOptions] = useState<MusicPlaylist[]>([]);
    const [playlistPickerLoading, setPlaylistPickerLoading] = useState(false);
    const [playlistPickerError, setPlaylistPickerError] = useState('');
    const [playlistPickerTrackId, setPlaylistPickerTrackId] = useState<string | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [currentPlaylistName, setCurrentPlaylistName] = useState('');
    const [autoplayBlocked, setAutoplayBlocked] = useState(false);
    const [isShuffle, setIsShuffle] = useState<boolean>(() => {
        if (typeof window === 'undefined') return true;
        return loadShuffleState();
    });

    // ── Refs ──────────────────────────────────────────────────────────────────

    // THE MOBILE AUDIO ENGINE: single element, never recreated
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Pre-fetched URL for the NEXT track (just a string — trivially fast to access)
    const prefetchRef = useRef<{ id: string; url: string } | null>(null);

    // If ended handler already called audio.src + audio.play(), skip the activeIndex useEffect
    const srcSetByEndedRef = useRef(false);

    // Track which audio url is currently loaded (prevents redundant src swaps)
    const currentUrlRef = useRef('');

    // Whether user has ever interacted (required for autoplay policy)
    const hasUserGestureRef = useRef(false);

    // Stale-closure-safe refs for values used inside the single-setup useEffect
    const activeIndexRef = useRef(0);
    const slidesRef = useRef<SlideTrack[]>([]);
    const isPlayingRef = useRef(false);
    const feedRef = useRef<HTMLDivElement>(null);
    const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
    const channelTracksRef = useRef<Partial<Record<string, Track[]>>>({});
    const playlistAllTracksRef = useRef<SidebarTrack[]>([]);
    const isSwitchingRef = useRef(false);
    const isLoadingMoreRef = useRef(false);
    const selectedChannelRef = useRef(selectedChannel);
    const hasAutoLoadedPlaylist = useRef(false);
    // loadAndBuildSlides is referenced from inside the closed-over ended handler
    const loadAndBuildSlidesRef = useRef<(slug: ChannelSlug, initial: boolean) => Promise<void>>(async () => { /* init */ });

    // YouTube iframe ref + ended detection
    const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
    const ytPlayOverlayRef = useRef<HTMLDivElement | null>(null);
    const ytEndedFiredRef = useRef(false);
    const ytEndedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ytAutoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [ytFading, setYtFading] = useState(false);

    // Facebook iframe state
    const [mobileFbEmbedUrl, setMobileFbEmbedUrl] = useState<string | null>(null);
    const [mobileFbFading, setMobileFbFading] = useState(false);
    const mobileFbEndedFiredRef = useRef(false);
    const mobileFbEndedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Global YouTube Pool
    const globalYtIdRef = useRef<string | null>(null);
    if (!globalYtIdRef.current) {
        const firstYt = slides.find(s => s.youtubeId);
        if (firstYt) globalYtIdRef.current = firstYt.youtubeId || null;
    }
    const lastLoadedYtIdRef = useRef<string | null>(null);
    const [ytPlaying, setYtPlaying] = useState(false); // true once confirmed or auto-dismissed

    // ── Keep refs in sync ─────────────────────────────────────────────────────
    useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
    useEffect(() => { slidesRef.current = slides; }, [slides]);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { selectedChannelRef.current = selectedChannel; }, [selectedChannel]);

    // ── YouTube ended detection ───────────────────────────────────────────────
    const activeSlideForYT = slides[activeIndex];
    useEffect(() => {
        if (!activeSlideForYT?.youtubeId) return;
        setYtFading(false);
        setYtPlaying(false); // reset — overlay shows briefly
        ytEndedFiredRef.current = false;

        // Change global iframe video via postMessage when activeSlide changes!
        if (globalYtIdRef.current && activeSlideForYT.youtubeId !== lastLoadedYtIdRef.current) {
            lastLoadedYtIdRef.current = activeSlideForYT.youtubeId;
            try {
                const win = ytIframeRef.current?.contentWindow;
                if (win) win.postMessage(JSON.stringify({ event: 'command', func: 'loadVideoById', args: [activeSlideForYT.youtubeId, 0] }), '*');
            } catch { }
        }

        // Auto-dismiss overlay after 2s — autoplay=1 in iframe src handles the actual play,
        // playerState postMessage is unreliable on mobile WebKit
        if (ytAutoDismissRef.current) clearTimeout(ytAutoDismissRef.current);
        ytAutoDismissRef.current = setTimeout(() => {
            setYtPlaying(true);
            // Also send playVideo command in case autoplay was blocked
            try {
                const win = ytIframeRef.current?.contentWindow;
                if (win) win.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
            } catch { }
        }, 1800);
        if (ytEndedTimerRef.current) clearTimeout(ytEndedTimerRef.current);

        const triggerEnd = () => {
            if (ytEndedFiredRef.current) return;
            ytEndedFiredRef.current = true;
            setYtFading(true);
            if (ytEndedTimerRef.current) clearTimeout(ytEndedTimerRef.current);
            ytEndedTimerRef.current = setTimeout(() => {
                const nextIdx = activeIndexRef.current + 1;
                if (nextIdx >= slidesRef.current.length) return;
                // Scroll feed to next slide BEFORE updating index
                const container = feedRef.current;
                if (container) {
                    isSwitchingRef.current = true;
                    container.scrollTop = nextIdx * container.clientHeight;
                    setTimeout(() => { isSwitchingRef.current = false; }, 300);
                }
                setActiveIndex(nextIdx);
            }, 600);
        };

        // Track duration/currentTime from infoDelivery (works on mobile where onStateChange may not fire)
        let ytDuration = activeSlideForYT.durationSec > 0 ? activeSlideForYT.durationSec : 0;

        const onMessage = (e: MessageEvent) => {
            if (!String(e.origin).includes('youtube.com')) return;
            try {
                const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;

                // Format 1: onStateChange — playerState 0 = ended
                if (data?.event === 'onStateChange' && (data?.info === 0 || data?.info === '0')) {
                    triggerEnd(); return;
                }
                if (data?.event === 'onStateChange' && (data?.info === 1 || data?.info === '1')) {
                    setYtPlaying(true); return;
                }

                // Format 2: infoDelivery — primary source on mobile (postMessage polling)
                if (data?.event === 'infoDelivery' && data?.info) {
                    const info = data.info;
                    if (info.playerState === 0) { triggerEnd(); return; }
                    if (info.playerState === 1) { setYtPlaying(true); }
                    // Update duration from actual video metadata if we didn't have it
                    if (info.duration > 0) ytDuration = info.duration;
                    // Detect end by currentTime ≥ duration - 0.5s
                    if (ytDuration > 0 && typeof info.currentTime === 'number' && info.currentTime >= ytDuration - 0.5) {
                        triggerEnd(); return;
                    }
                }
            } catch { /* malformed postMessage — ignore */ }
        };
        window.addEventListener('message', onMessage);

        // Fallback timer — always set. Use known duration, else 10 minutes max.
        const fallbackSec = ytDuration > 10 ? ytDuration + 5 : 600;
        const fallbackTimer = setTimeout(triggerEnd, fallbackSec * 1000);

        // Ping interval: request video state every second via postMessage
        // This is how mobile browsers get infoDelivery events (they don't push spontaneously)
        const pingInterval = setInterval(() => {
            try {
                const win = ytIframeRef.current?.contentWindow;
                if (win) {
                    win.postMessage(JSON.stringify({ event: 'listening', id: activeSlideForYT.id }), '*');
                    win.postMessage(JSON.stringify({ event: 'command', func: 'getVideoData', args: [] }), '*');
                }
            } catch { /* iframe not ready */ }
        }, 1000);

        return () => {
            window.removeEventListener('message', onMessage);
            if (ytEndedTimerRef.current) clearTimeout(ytEndedTimerRef.current);
            if (ytAutoDismissRef.current) clearTimeout(ytAutoDismissRef.current);
            clearTimeout(fallbackTimer);
            clearInterval(pingInterval);
        };
    }, [activeSlideForYT?.youtubeId, activeSlideForYT?.id, activeSlideForYT?.durationSec]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Facebook ended detection (message listener + fallback timer) ───────────
    const activeSlideFbId = slides[activeIndex]?.facebookId;
    useEffect(() => {
        if (!activeSlideFbId) {
            setMobileFbFading(true);
            const t = setTimeout(() => { setMobileFbEmbedUrl(null); setMobileFbFading(false); }, 600);
            return () => clearTimeout(t);
        }
        const fbId = activeSlideFbId;
        const isReel = !!slides[activeIndex]?.facebookIsReel;
        const fbHref = isReel ? `https://www.facebook.com/reel/${fbId}` : `https://www.facebook.com/watch?v=${fbId}`;
        const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(fbHref)}&show_text=false&autoplay=1&muted=1&loop=0`;
        setMobileFbFading(false);
        setMobileFbEmbedUrl(embedUrl);
        mobileFbEndedFiredRef.current = false;
        if (mobileFbEndedTimerRef.current) clearTimeout(mobileFbEndedTimerRef.current);

        const triggerFbEnd = () => {
            if (mobileFbEndedFiredRef.current) return;
            mobileFbEndedFiredRef.current = true;
            setMobileFbFading(true);
            mobileFbEndedTimerRef.current = setTimeout(() => {
                const nextIdx = activeIndexRef.current + 1;
                if (nextIdx >= slidesRef.current.length) return;
                const container = feedRef.current;
                if (container) {
                    isSwitchingRef.current = true;
                    container.scrollTop = nextIdx * container.clientHeight;
                    setTimeout(() => { isSwitchingRef.current = false; }, 300);
                }
                setActiveIndex(nextIdx);
                setCurrentTime(0); setDuration(0);
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
            if (mobileFbEndedTimerRef.current) clearTimeout(mobileFbEndedTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSlideFbId]);

    // ── touchend → postMessage playVideo (iOS Safari autoplay workaround) ────
    // Scroll events are NOT user activation on iOS. touchend IS.
    // When user lifts finger after swiping, if the new active slide is YouTube,
    // we postMessage playVideo to the iframe (which is mounted synchronously
    // before touchend fires thanks to React's batched updates).
    useEffect(() => {
        const container = feedRef.current;
        if (!container) return;

        const handleTouchEnd = () => {
            // Synchronously tap the play overlay and ping iframe to capture iOS user gesture token
            if (ytPlayOverlayRef.current) ytPlayOverlayRef.current.click();
            try {
                const win = ytIframeRef.current?.contentWindow;
                if (win) win.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
            } catch { /* iframe not ready */ }
        };

        container.addEventListener('touchend', handleTouchEnd, { passive: true });
        return () => container.removeEventListener('touchend', handleTouchEnd);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Visibility change: re-sync scroll when user unlocks screen / switches back ──
    // When iOS/Android changes track via lock-screen buttons while screen is off,
    // activeIndex advances but the scroll position stays at the old slide.
    // On `visibilitychange` → visible, we snap the feed to the current activeIndex.
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden) return;
            const container = feedRef.current;
            if (!container) return;
            const idx = activeIndexRef.current;
            const expectedScrollTop = idx * container.clientHeight;
            // Only correct if meaningfully out of sync (> 10px off)
            if (Math.abs(container.scrollTop - expectedScrollTop) > 10) {
                isSwitchingRef.current = true;
                container.scrollTop = expectedScrollTop;
                setTimeout(() => { isSwitchingRef.current = false; }, 300);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── MediaSession updater ──────────────────────────────────────────────────
    const updateMediaSession = useCallback((track: SlideTrack, idx: number, allSlides: SlideTrack[]) => {
        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title || 'WordAI Music',
            artist: track.artist || 'WordAI',
            album: 'WordAI Music',
            // 3 sizes required for iOS lock screen to show artwork correctly
            artwork: track.thumbnailUrl ? [
                { src: track.thumbnailUrl, sizes: '96x96', type: 'image/jpeg' },
                { src: track.thumbnailUrl, sizes: '256x256', type: 'image/jpeg' },
                { src: track.thumbnailUrl, sizes: '512x512', type: 'image/jpeg' },
            ] : [],
        });
        const audio = audioRef.current;
        if (!audio) return;
        navigator.mediaSession.setActionHandler('play', () => { void audio.play(); setIsPlaying(true); hasUserGestureRef.current = true; });
        navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); setIsPlaying(false); });
        navigator.mediaSession.setActionHandler('previoustrack', idx > 0 ? () => setActiveIndex(idx - 1) : null);
        navigator.mediaSession.setActionHandler('nexttrack', idx < allSlides.length - 1 ? () => setActiveIndex(idx + 1) : null);
        navigator.mediaSession.playbackState = isPlayingRef.current ? 'playing' : 'paused';
    }, []);

    // ── Helper: pre-fetch next track URL into ref ─────────────────────────────
    const prefetchNext = useCallback((currentIdx: number, allSlides: SlideTrack[]) => {
        const next = allSlides[currentIdx + 1];
        if (next) prefetchRef.current = { id: next.id, url: next.audioUrl };
    }, []);

    // ── SINGLE AUDIO ELEMENT — created once, never recreated ─────────────────
    useEffect(() => {
        const audio = new Audio();
        audio.preload = 'auto';
        audioRef.current = audio;

        audio.addEventListener('timeupdate', () => setCurrentTime(audio.currentTime));
        audio.addEventListener('loadedmetadata', () => setDuration(audio.duration || 0));
        audio.addEventListener('playing', () => { setIsPlaying(true); setAutoplayBlocked(false); });
        audio.addEventListener('error', () => {
            // Only skip on error if we actually have a src loaded (not a YouTube/TikTok track with empty src)
            if (!audio.src || audio.src === window.location.href) return;
            const nextIdx = activeIndexRef.current + 1;
            const nextTrack = slidesRef.current[nextIdx];
            // Don't error-advance into a YouTube/TikTok/Facebook track — the iframe handles those
            if (!nextTrack || nextTrack.youtubeId || nextTrack.tiktokId || nextTrack.facebookId) return;
            if (nextIdx < slidesRef.current.length) setActiveIndex(nextIdx);
        });

        // ── THE CRITICAL HANDLER ──────────────────────────────────────────
        // Fires when a track ends. We swap .src IMMEDIATELY before any React
        // state update — this keeps <audio> continuously active so iOS/Android
        // won't revoke the audio session.
        audio.addEventListener('ended', () => {
            const currentIdx = activeIndexRef.current;
            const allSlides = slidesRef.current;
            const nextIdx = currentIdx + 1;

            if (nextIdx >= allSlides.length) {
                setIsPlaying(false);
                return;
            }

            const nextTrack = allSlides[nextIdx]!;
            const prefetched = prefetchRef.current;

            // Use pre-fetched URL if it matches (just a string — instant access)
            const url = (prefetched?.id === nextTrack.id) ? prefetched.url : nextTrack.audioUrl;
            prefetchRef.current = null;

            // YouTube/TikTok/Facebook tracks: just advance the index — the iframe handles playback.
            // Do NOT clear audio.src here — the activeIndex useEffect will set the silent loop,
            // keeping the OS MediaSession alive through the track transition.
            if (nextTrack.youtubeId || nextTrack.tiktokId || nextTrack.facebookId || url.startsWith('yt:') || url.startsWith('tt:') || url.startsWith('fb:') || url.startsWith('fbreel:')) {
                srcSetByEndedRef.current = true;
                currentUrlRef.current = '';
                setActiveIndex(nextIdx);
                setCurrentTime(0); setDuration(0);
                const container = feedRef.current;
                if (container) {
                    isSwitchingRef.current = true;
                    container.scrollTop = nextIdx * container.clientHeight;
                    setTimeout(() => { isSwitchingRef.current = false; }, 300);
                }
                return;
            }

            // ── CRITICAL: audio src swap BEFORE React state update ──
            // The <audio> element never becomes "inactive", so iOS keeps the session.
            srcSetByEndedRef.current = true;  // tell activeIndex useEffect to skip
            currentUrlRef.current = url;
            audio.src = url;
            void audio.play()
                .then(() => setAutoplayBlocked(false))
                .catch(() => { /* AbortError if track changes instantly */ });

            // React state updates follow — UI only, audio is already playing
            setActiveIndex(nextIdx);
            setCurrentTime(0);
            setDuration(0);

            // Scroll feed to next slide
            const container = feedRef.current;
            if (container) {
                isSwitchingRef.current = true;
                container.scrollTop = nextIdx * container.clientHeight;
                setTimeout(() => { isSwitchingRef.current = false; }, 300);
            }

            // Pre-fetch the track after next
            const subsequent = allSlides[nextIdx + 1];
            if (subsequent) prefetchRef.current = { id: subsequent.id, url: subsequent.audioUrl };

            // Update lock screen metadata (direct navigator call — no React re-render needed)
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: nextTrack.title || 'WordAI Music',
                    artist: nextTrack.artist || 'WordAI',
                    album: 'WordAI Music',
                    artwork: nextTrack.thumbnailUrl ? [
                        { src: nextTrack.thumbnailUrl, sizes: '96x96', type: 'image/jpeg' },
                        { src: nextTrack.thumbnailUrl, sizes: '512x512', type: 'image/jpeg' },
                    ] : [],
                });
                navigator.mediaSession.playbackState = 'playing';
            }

            // Trigger load-more when near end of slides list
            if (nextIdx >= allSlides.length - 3) {
                const slug = nextTrack.channelSlug;
                if (slug !== 'playlist') void loadAndBuildSlidesRef.current(slug, false);
            }
        });

        return () => {
            audio.pause();
            audio.removeAttribute('src');
        };
    }, []); // ← ONCE — audio element lives for the entire component lifetime

    // ── Volume sync ───────────────────────────────────────────────────────────
    useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);

    // ── Play/pause sync ───────────────────────────────────────────────────────
    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        // YouTube/TikTok/Facebook tracks: iframe controls its own playback — do NOT touch audio element
        const track = slides[activeIndex];
        if (track?.youtubeId || track?.tiktokId || track?.facebookId) return;
        if (isPlaying) {
            hasUserGestureRef.current = true;
            void a.play()
                .then(() => setAutoplayBlocked(false))
                .catch((err: unknown) => {
                    if ((err as { name?: string })?.name === 'NotAllowedError') setAutoplayBlocked(true);
                });
        } else {
            a.pause();
        }
    }, [isPlaying]);

    // ── Active track change (user navigation or initial load) ─────────────────
    useEffect(() => {
        const audio = audioRef.current;
        const track = slides[activeIndex];
        if (!audio || !track) return;

        // ended handler already set src + called play() — just sync UI
        if (srcSetByEndedRef.current) {
            srcSetByEndedRef.current = false;
            updateMediaSession(track, activeIndex, slides);
            return;
        }

        // User navigated (swipe, lock-screen prev/next, channel switch, etc.)
        const prefetched = prefetchRef.current;
        const url = (prefetched?.id === track.id) ? prefetched.url : track.audioUrl;
        prefetchRef.current = null;

        // YouTube / TikTok / Facebook tracks: keep <audio> alive with a silent loop to preserve iOS/Android lock-screen session.
        if (track.youtubeId || track.tiktokId || track.facebookId) {
            if (currentUrlRef.current !== 'silent') {
                currentUrlRef.current = 'silent';
                audio.loop = true;
                audio.volume = 0;
                // Minimal 1-second silent MP3 — keeps the OS audio session alive while the iframe plays
                audio.src = 'data:audio/mpeg;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
                    'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' +
                    'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
                audio.play().catch(() => { });
            }
            setCurrentTime(0);
            setDuration(0);
            prefetchNext(activeIndex, slides);
            updateMediaSession(track, activeIndex, slides);
            return;
        }

        // Reset loop/volume from silent-placeholder mode back to normal
        audio.loop = false;
        audio.volume = volume;

        // For playlist tracks, try session-cached blob first
        const isPlaylist = track.channelSlug === 'playlist';
        let resolvedUrl = url;
        if (!url.startsWith('local:')) {
            const sessionBlob = isPlaylist ? getSessionBlob(track.id) : null;
            if (sessionBlob) resolvedUrl = URL.createObjectURL(sessionBlob);
        }

        // Only swap src if it actually changed
        if (currentUrlRef.current !== resolvedUrl) {
            currentUrlRef.current = resolvedUrl;
            audio.src = resolvedUrl;
            audio.load();
        }

        if (hasUserGestureRef.current) {
            void audio.play()
                .then(() => setAutoplayBlocked(false))
                .catch((err: unknown) => {
                    if ((err as { name?: string })?.name === 'NotAllowedError') setAutoplayBlocked(true);
                });
        }

        setCurrentTime(0);
        setDuration(0);
        prefetchNext(activeIndex, slides);
        updateMediaSession(track, activeIndex, slides);

        // Background-fetch blob for playlist tracks (for next session)
        if (isPlaylist && !url.startsWith('local:') && !getSessionBlob(track.id)) {
            void (async () => {
                try {
                    const res = await fetch(track.audioUrl);
                    if (res.ok) setSessionBlob(track.id, await res.blob());
                } catch { /* ignore */ }
            })();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeIndex, slides]);

    // ── Cover-based theme colour extraction ──────────────────────────────────
    useEffect(() => {
        const track = slides[activeIndex];
        if (!track?.thumbnailUrl) { setCoverThemeIdx(null); return; }
        const url = track.thumbnailUrl;
        if (coverThemeCache.has(url)) { setCoverThemeIdx(coverThemeCache.get(url) ?? null); return; }
        void getImageThemeIndex(url).then(idx => {
            coverThemeCache.set(url, idx);
            setCoverThemeIdx(idx);
        });
    }, [activeIndex, slides]);

    // ── Load-more when near end (triggered by scroll) ─────────────────────────
    useEffect(() => {
        if (slides.length === 0) return;
        const slug = slides[activeIndex]?.channelSlug;
        if (!slug || slug === 'playlist') return;
        if (activeIndex >= slides.length - 3) void loadAndBuildSlidesRef.current(slug, false);
    }, [activeIndex, slides.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Channel & playlist data loading ──────────────────────────────────────

    const syncRemotePlaylists = useCallback(async () => {
        setPlaylistPickerLoading(true);
        try {
            const lists = await getMusicPlaylists();
            setPlaylistOptions(lists);
            setSavedIds(new Set(lists.flatMap(p => p.tracks.map(tr => tr.id))));
        } catch {
            setPlaylistOptions([]); setSavedIds(new Set());
        } finally { setPlaylistPickerLoading(false); }
    }, []);

    const loadAndBuildSlides = useCallback(async (slug: ChannelSlug, initial = true) => {
        if (initial) {
            setIsLoading(true); setActiveIndex(0);
            slideRefs.current = []; isSwitchingRef.current = true;
        } else {
            if (isLoadingMoreRef.current) return;
            isLoadingMoreRef.current = true;
        }
        try {
            let tracks = channelTracksRef.current[slug];
            if (!tracks) {
                tracks = await loadChannel(slug);
                channelTracksRef.current[slug] = tracks;
            }
            if (initial && selectedChannelRef.current === 'playlist') {
                setIsLoading(false); isSwitchingRef.current = false; return;
            }
            if (!tracks || tracks.length === 0) {
                if (initial) setIsLoading(false); else isLoadingMoreRef.current = false; return;
            }
            const batch = popTracks(slug, tracks, initial ? INITIAL_LOAD : LOAD_MORE_BATCH);
            const newSlides: SlideTrack[] = batch.map(tr => ({ ...tr, channelSlug: slug }));
            if (initial) {
                setSlides(newSlides);
                setTimeout(() => {
                    feedRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
                    isSwitchingRef.current = false;
                }, 50);
                setIsLoading(false);
            } else {
                setSlides(prev => [...prev, ...newSlides]);
                isLoadingMoreRef.current = false;
            }
        } catch {
            if (initial) setIsLoading(false);
            else isLoadingMoreRef.current = false;
        }
    }, []);

    // Keep ref in sync (ended handler uses this ref to avoid stale closure)
    useEffect(() => { loadAndBuildSlidesRef.current = loadAndBuildSlides; }, [loadAndBuildSlides]);

    // Initial load
    useEffect(() => {
        const ctx = loadLastCtx();
        if (ctx?.type === 'playlist' && ctx.tracks.length > 0) {
            playlistAllTracksRef.current = ctx.tracks;
            const newSlides: SlideTrack[] = ctx.tracks.slice(0, MAX_SLIDES).map(tr => ({
                id: tr.id, title: tr.title, artist: tr.artist, audioUrl: tr.audioUrl,
                durationSec: tr.durationSec, source: tr.source, thumbnailUrl: tr.thumbnailUrl,
                channelSlug: 'playlist',
                youtubeId: tr.audioUrl.startsWith('yt:') ? tr.audioUrl.slice(3) : (tr as any).youtubeId,
                tiktokId: tr.audioUrl.startsWith('tt:') ? tr.audioUrl.slice(3) : (tr as any).tiktokId,
                facebookId: tr.audioUrl.startsWith('fbreel:') ? tr.audioUrl.slice(7) : tr.audioUrl.startsWith('fb:') ? tr.audioUrl.slice(3) : (tr as any).facebookId,
                facebookIsReel: tr.audioUrl.startsWith('fbreel:') ? true : undefined,
            }));
            setSlides(newSlides); setSelectedChannel('playlist' as ChannelSlug); setIsLoading(false);
        } else {
            const slug = ctx?.type === 'channel' ? ctx.slug : 'background-music';
            void loadAndBuildSlides(slug, true);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (user) void syncRemotePlaylists();
        else hasAutoLoadedPlaylist.current = false;
    }, [syncRemotePlaylists, user]);

    // Auto-switch to most recent playlist on first sync
    useEffect(() => {
        if (hasAutoLoadedPlaylist.current || playlistOptions.length === 0) return;
        hasAutoLoadedPlaylist.current = true;
        if (selectedChannelRef.current === 'playlist') return;
        const mostRecent = playlistOptions[0];
        if (!mostRecent || mostRecent.tracks.length === 0) return;
        playlistAllTracksRef.current = mostRecent.tracks;
        const newSlides: SlideTrack[] = mostRecent.tracks.slice(0, MAX_SLIDES).map(tr => ({
            id: tr.id, title: tr.title, artist: tr.artist, audioUrl: tr.audioUrl,
            durationSec: tr.durationSec, source: tr.source as 'youtube' | 'tiktok' | 'local',
            thumbnailUrl: tr.thumbnailUrl, channelSlug: 'playlist',
            youtubeId: tr.audioUrl.startsWith('yt:') ? tr.audioUrl.slice(3) : (tr as any).youtubeId,
            tiktokId: tr.audioUrl.startsWith('tt:') ? tr.audioUrl.slice(3) : (tr as any).tiktokId,
            facebookId: tr.audioUrl.startsWith('fbreel:') ? tr.audioUrl.slice(7) : tr.audioUrl.startsWith('fb:') ? tr.audioUrl.slice(3) : (tr as any).facebookId,
            facebookIsReel: tr.audioUrl.startsWith('fbreel:') ? true : undefined,
        }));
        saveLastCtx({ type: 'playlist', id: mostRecent.id, name: mostRecent.name, tracks: mostRecent.tracks.slice(0, 50) });
        if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute('src'); currentUrlRef.current = ''; }
        isSwitchingRef.current = true; slideRefs.current = [];
        setCurrentPlaylistName(mostRecent.name);
        setSlides(newSlides); setSelectedChannel('playlist' as ChannelSlug);
        setActiveIndex(0); setIsPlaying(false);
        setTimeout(() => { feedRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); isSwitchingRef.current = false; }, 80);
    }, [playlistOptions]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const handler = () => void syncRemotePlaylists();
        window.addEventListener(MUSIC_PLAYLISTS_UPDATED_EVENT, handler);
        return () => window.removeEventListener(MUSIC_PLAYLISTS_UPDATED_EVENT, handler);
    }, [syncRemotePlaylists]);

    // ── Scroll detection: update active index when user swipes ────────────────
    const handleScroll = useCallback(() => {
        if (isSwitchingRef.current) return;
        const container = feedRef.current;
        if (!container) return;
        const idx = Math.round(container.scrollTop / container.clientHeight);
        if (idx !== activeIndexRef.current && idx >= 0 && idx < slidesRef.current.length) {
            setActiveIndex(idx);
            const nextTrack = slidesRef.current[idx];
            // Don't set isPlaying for YouTube/TikTok/Facebook — iframe autoplay handles it
            if (hasUserGestureRef.current && !nextTrack?.youtubeId && !nextTrack?.tiktokId && !nextTrack?.facebookId) {
                setIsPlaying(true);
            }
        }
    }, []);

    // ── Action handlers ───────────────────────────────────────────────────────

    const stopIframeMedia = useCallback(() => {
        // Stop YouTube iframe audio
        try {
            const win = ytIframeRef.current?.contentWindow;
            if (win) win.postMessage(JSON.stringify({ event: 'command', func: 'stopVideo', args: [] }), '*');
        } catch { }
        // Stop Facebook iframe audio
        setMobileFbEmbedUrl(null);
        setMobileFbFading(false);
    }, []);

    const handleSelectChannel = useCallback((slug: ChannelSlug) => {
        if (slug === selectedChannel) return;
        if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute('src'); currentUrlRef.current = ''; }
        stopIframeMedia();
        setIsPlaying(false); setSelectedChannel(slug); setCurrentTime(0); setDuration(0);
        saveLastCtx({ type: 'channel', slug });
        void loadAndBuildSlides(slug, true);
    }, [selectedChannel, loadAndBuildSlides, stopIframeMedia]);

    const handlePlayTracks = useCallback((tracks: SidebarTrack[], startIndex = 0, playlistId?: string, playlistName?: string) => {
        let actualTracks = tracks;
        if (startIndex > 0 && startIndex < tracks.length) {
            actualTracks = [...tracks.slice(startIndex), ...tracks.slice(0, startIndex)];
        }
        const ordered = isShuffle ? [actualTracks[0]!, ...shuffleArr(actualTracks.slice(1))] : actualTracks;
        playlistAllTracksRef.current = ordered;
        const newSlides: SlideTrack[] = ordered.slice(0, MAX_SLIDES).map(tr => ({
            id: tr.id, title: tr.title, artist: tr.artist, audioUrl: tr.audioUrl,
            durationSec: tr.durationSec, source: tr.source, channelSlug: 'playlist', thumbnailUrl: tr.thumbnailUrl,
            youtubeId: tr.audioUrl.startsWith('yt:') ? tr.audioUrl.slice(3) : (tr as any).youtubeId,
            tiktokId: tr.audioUrl.startsWith('tt:') ? tr.audioUrl.slice(3) : (tr as any).tiktokId,
            facebookId: tr.audioUrl.startsWith('fbreel:') ? tr.audioUrl.slice(7) : tr.audioUrl.startsWith('fb:') ? tr.audioUrl.slice(3) : (tr as any).facebookId,
            facebookIsReel: tr.audioUrl.startsWith('fbreel:') ? true : undefined,
        }));
        saveLastCtx({ type: 'playlist', id: playlistId ?? 'custom', name: playlistName ?? 'Playlist', tracks: ordered.slice(0, 50) });
        if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute('src'); currentUrlRef.current = ''; }
        stopIframeMedia();
        isSwitchingRef.current = true;
        if (feedRef.current) feedRef.current.scrollTop = 0;
        slideRefs.current = [];
        setCurrentPlaylistName(playlistName ?? 'Playlist');
        setSlides(newSlides); setSelectedChannel('playlist' as ChannelSlug);
        setActiveIndex(0); setIsPlaying(false); setIsMenuOpen(false);
        setTimeout(() => { feedRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); isSwitchingRef.current = false; }, 80);
    }, [isShuffle, stopIframeMedia]);

    const handleLike = useCallback((id: string) => { setLikedIds(new Set(toggleSetStorage('music_liked', id))); }, []);
    const handleSave = useCallback((id: string) => { setPlaylistPickerError(''); setPlaylistPickerTrackId(prev => prev === id ? null : id); }, []);

    const handleSaveToPlaylist = useCallback(async (track: SlideTrack | undefined, plId: string) => {
        if (!track) return;
        try {
            await addTrackToMusicPlaylist(plId, { id: track.id, title: track.title, artist: track.artist, audioUrl: track.audioUrl, durationSec: track.durationSec, source: track.source as 'youtube' | 'tiktok' | 'local', thumbnailUrl: track.thumbnailUrl });
            await syncRemotePlaylists(); setPlaylistPickerTrackId(null);
        } catch (e) { setPlaylistPickerError((e as Error).message || 'Failed'); }
    }, [syncRemotePlaylists]);

    const handleSeek = useCallback((time: number) => {
        if (audioRef.current) { audioRef.current.currentTime = time; setCurrentTime(time); }
    }, []);

    const handleShare = useCallback(() => {
        const track = slides[activeIndex]; if (!track) return;
        const text = track.title ? `${track.title} — ${track.artist}` : 'WordAI Music';
        if (navigator.share) navigator.share({ title: text, url: window.location.href }).catch(() => null);
        else navigator.clipboard?.writeText(window.location.href).catch(() => null);
    }, [slides, activeIndex]);

    const loadChannelTracksForSidebar = useCallback(async (slug: string): Promise<SidebarTrack[]> => {
        const tracks = await loadChannel(slug);
        return tracks.map(tr => ({ id: tr.id, title: tr.title, artist: tr.artist, audioUrl: tr.audioUrl, durationSec: tr.durationSec, source: tr.source }));
    }, []);

    // Volume mute toggle helper
    const prevVolRef = useRef(1);
    const isMuted = volume === 0;
    const toggleMute = useCallback(() => {
        if (isMuted) { setVolume(prevVolRef.current); }
        else { prevVolRef.current = volume; setVolume(0); }
    }, [isMuted, volume]);

    // ── Render ────────────────────────────────────────────────────────────────

    const activeSlide = slides[activeIndex];
    const getChannelMeta = (slug: ChannelSlug): AnyChannelMeta =>
        MUSIC_CHANNELS.find(c => c.slug === slug)
        ?? (slug === 'playlist' && currentPlaylistName ? { ...PLAYLIST_META, name: currentPlaylistName, label: currentPlaylistName } : PLAYLIST_META);

    return (
        <>
            <style>{`
                @keyframes vinylSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes soundBar  { from { opacity: 0.5; } to { opacity: 1; transform: scaleY(1.3); } }
                @keyframes ambientPulse { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.04); } }
            `}</style>

            {/* Music library sidebar */}
            <MusicSidebar
                isOpen={isMenuOpen}
                onClose={() => setIsMenuOpen(false)}
                channels={MUSIC_CHANNELS.map(ch => ({ slug: ch.slug, name: ch.name, label: ch.label, accent: ch.accent }))}
                selectedChannelSlug={selectedChannel}
                onSelectChannel={slug => {
                    const ch = MUSIC_CHANNELS.find(c => c.slug === slug);
                    if (ch) handleSelectChannel(ch.slug); else handleSelectChannel(slug as ChannelSlug);
                }}
                onPlayTracks={handlePlayTracks}
                onLoadChannelTracks={loadChannelTracksForSidebar}
                isDark={isDark}
                isVietnamese={isVietnamese}
                desktopPinned
                currentTrackId={activeSlide?.id}
                isShuffle={isShuffle}
                onToggleShuffle={() => setIsShuffle(v => { saveShuffleState(!v); return !v; })}
            />

            <div className="h-full flex lg:pl-[300px]">
                {/* Scrollable snap feed */}
                <div
                    ref={feedRef}
                    className="flex-1 relative overflow-y-scroll snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    onScroll={handleScroll}
                >
                    {/* Global Shared YouTube Iframe (Video Pooling Pattern) */}
                    {globalYtIdRef.current && (
                        <div
                            className={`absolute left-0 right-0 z-10 transition-opacity duration-[600ms] ${activeSlide?.youtubeId && !ytFading ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                            style={{ top: `${activeIndex * 100}%`, height: 'calc(100% - 140px)' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <iframe
                                ref={ytIframeRef}
                                src={`https://www.youtube.com/embed/${globalYtIdRef.current}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=https://www.wordai.pro`}
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
                            {/* Tap-to-play overlay */}
                            {!ytPlaying && activeSlide?.youtubeId && (
                                <div
                                    ref={ytPlayOverlayRef}
                                    className="absolute inset-0 z-20 flex items-center justify-center cursor-pointer pointer-events-auto"
                                    style={{ background: 'rgba(0,0,0,0.25)' }}
                                    onClick={() => {
                                        try {
                                            const win = ytIframeRef.current?.contentWindow;
                                            if (win) win.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
                                        } catch { }
                                        setYtPlaying(true);
                                    }}
                                >
                                    <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20">
                                        <Play className="w-7 h-7 text-white ml-1" />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Global Facebook Iframe (mobile) — remounted per track via key */}
                    {mobileFbEmbedUrl && (
                        <div
                            className={`absolute left-0 right-0 z-10 transition-opacity duration-[600ms] ${activeSlide?.facebookId && !mobileFbFading ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                            style={{ top: `calc(${activeIndex * 100}% + 100px)`, height: 'calc(100% - 240px)', background: '#000' }}
                            onClick={e => e.stopPropagation()}
                        >
                            <iframe
                                key={mobileFbEmbedUrl}
                                src={mobileFbEmbedUrl}
                                className="w-full h-full"
                                style={{ border: 'none' }}
                                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                                allowFullScreen
                                scrolling="no"
                            />
                        </div>
                    )}

                    {isLoading && slides.length === 0 ? (
                        <div className="h-full flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-14 h-14 rounded-full border-4 border-white/10 border-t-indigo-500 animate-spin" />
                                <p className="text-sm text-gray-400">{t('Đang tải nhạc…', 'Loading music…', isVietnamese)}</p>
                            </div>
                        </div>
                    ) : slides.map((slide, i) => {
                        const chMeta = getChannelMeta(slide.channelSlug);
                        const isActive = i === activeIndex;
                        const theme = getTrackTheme(slide, chMeta.accent, isActive ? coverThemeIdx : undefined);
                        const progress = isActive && duration > 0 ? (currentTime / duration) * 100 : 0;

                        return (
                            <div
                                key={`${slide.channelSlug}-${slide.id}-${i}`}
                                ref={el => { slideRefs.current[i] = el; }}
                                className="h-full flex-shrink-0 snap-start relative overflow-hidden"
                                style={{ background: (slide.youtubeId || slide.facebookId) && isActive ? '#000' : theme.background }}
                            >
                                {/* Ambient pulse rings */}
                                {isActive && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                                        {[1, 2, 3].map(ri => (
                                            <div key={ri} className="absolute rounded-full" style={{
                                                width: 220 + ri * 80, height: 220 + ri * 80,
                                                border: `1px solid ${theme.accent}${ri === 1 ? '25' : ri === 2 ? '15' : '08'}`,
                                                animation: isPlaying ? `ambientPulse ${2 + ri * 0.4}s ease-in-out ${ri * 0.3}s infinite` : 'none',
                                            }} />
                                        ))}
                                    </div>
                                )}

                                {/* Hamburger */}
                                <button
                                    onClick={e => { e.stopPropagation(); setIsMenuOpen(true); }}
                                    className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10 text-white hover:bg-black/60 transition-colors"
                                >
                                    <Menu className="w-5 h-5" />
                                </button>

                                {/* Channel badge */}
                                <div className="absolute top-[72px] left-0 right-0 flex justify-center z-10">
                                    <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
                                        style={{ background: `${theme.accent}20`, border: `1px solid ${theme.accent}35` }}>
                                        <Music2 className="w-3 h-3" style={{ color: theme.accent }} />
                                        <span className="text-xs font-medium" style={{ color: theme.accent }}>
                                            {slide.channelSlug === 'playlist' ? chMeta.name : chMeta.label}
                                        </span>
                                    </div>
                                </div>

                                {/* Center: Vinyl + sound bars OR YouTube/Facebook global block (empty space) */}
                                {slide.youtubeId || slide.facebookId ? (
                                    /* Empty placeholder because global YT/FB iframe overlays here */
                                    <div className="absolute inset-0 bottom-[140px] z-10 pointer-events-none" onClick={e => e.stopPropagation()} />
                                ) : (
                                    /* Normal vinyl disc */
                                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 cursor-pointer"
                                        onClick={() => { hasUserGestureRef.current = true; setIsPlaying(p => !p); }}>
                                        <VinylDisc isSpinning={isActive && isPlaying} accent={theme.accent} thumbnailUrl={slide.thumbnailUrl} />
                                        <div className="mt-6">
                                            <SoundBars playing={isActive && isPlaying} />
                                        </div>
                                    </div>
                                )}

                                {/* Bottom gradient overlay */}
                                <div className="absolute inset-x-0 bottom-0 h-2/5 pointer-events-none"
                                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)' }} />

                                {/* Track info + progress bar */}
                                <div className="absolute bottom-0 left-4 right-16 pb-10 z-10">
                                    {slide.title ? (
                                        <>
                                            <p className="text-white font-bold text-lg leading-tight truncate drop-shadow">{slide.title}</p>
                                            {slide.artist && <p className="text-white/65 text-sm mt-0.5 truncate">{slide.artist}</p>}
                                        </>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${chMeta.accent}30` }}>
                                                <Music2 className="w-4 h-4" style={{ color: theme.accent }} />
                                            </div>
                                            <div>
                                                <p className="text-white/80 font-semibold text-sm">{chMeta.name}</p>
                                                <p className="text-white/40 text-xs">Track {slide.id.slice(-6)}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Progress bar — hidden for YouTube/Facebook tracks */}
                                    {!slide.youtubeId && !slide.facebookId && <div className="mt-3 flex items-center gap-1.5">
                                        <div
                                            className="flex-1 relative flex items-center cursor-pointer"
                                            style={{ height: 18 }}
                                            onClick={e => {
                                                e.stopPropagation();
                                                if (!isActive || duration <= 0) return;
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                handleSeek(((e.clientX - rect.left) / rect.width) * duration);
                                            }}
                                        >
                                            <div className="w-full h-[3px] rounded-full bg-white/15 relative overflow-visible">
                                                <div className="h-full rounded-full" style={{ width: `${isActive ? progress : 0}%`, background: theme.accent }} />
                                                {isActive && duration > 0 && (
                                                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full pointer-events-none shadow-sm"
                                                        style={{ left: `max(0px, calc(${progress}% - 6px))`, background: theme.accent, border: '1.5px solid rgba(255,255,255,0.5)' }} />
                                                )}
                                            </div>
                                        </div>
                                        {isActive && duration > 0 && (
                                            <span className="text-white/40 text-[10px] tabular-nums flex-shrink-0">{fmtTime(currentTime)}</span>
                                        )}
                                        <button onClick={e => { e.stopPropagation(); toggleMute(); }} className="flex-shrink-0 text-white/60 hover:text-white transition-colors">
                                            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>}
                                </div>

                                {/* Right action icons */}
                                <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-4">
                                    {/* Play/Pause button — hidden for YouTube/Facebook (iframe has own controls) */}
                                    {!slide.youtubeId && !slide.facebookId && (
                                        <button onClick={() => { hasUserGestureRef.current = true; setIsPlaying(p => !p); }}
                                            className="flex flex-col items-center gap-1">
                                            <div className="w-11 h-11 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center border border-white/10 text-white">
                                                {isActive && isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                                            </div>
                                        </button>)}
                                    <button onClick={() => handleLike(slide.id)} className="flex flex-col items-center gap-1">
                                        <div className={`w-11 h-11 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center border border-white/10 ${likedIds.has(slide.id) ? 'text-red-400' : 'text-white'}`}>
                                            <Heart className="w-5 h-5" fill={likedIds.has(slide.id) ? 'currentColor' : 'none'} />
                                        </div>
                                    </button>
                                    <button onClick={() => handleSave(slide.id)} className="flex flex-col items-center gap-1">
                                        <div className={`w-11 h-11 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center border border-white/10 ${savedIds.has(slide.id) ? 'text-yellow-400' : 'text-white'}`}>
                                            {savedIds.has(slide.id) ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
                                        </div>
                                    </button>
                                    <button onClick={handleShare} className="flex flex-col items-center gap-1">
                                        <div className="w-11 h-11 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center border border-white/10 text-white">
                                            <Share2 className="w-5 h-5" />
                                        </div>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Tap-to-unmute hint (autoplay blocked) */}
            {autoplayBlocked && (
                <div
                    className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9990] pointer-events-auto"
                    onClick={() => { hasUserGestureRef.current = true; setIsPlaying(true); }}
                >
                    <div className="flex items-center gap-2 rounded-full bg-black/70 backdrop-blur-md px-5 py-2.5 text-white text-sm font-medium shadow-xl ring-1 ring-white/10 cursor-pointer active:scale-95 transition-transform">
                        <Volume2 className="w-4 h-4 text-indigo-400" />
                        {t('Chạm để bật âm thanh', 'Tap to unmute', isVietnamese)}
                    </div>
                </div>
            )}

            {/* Playlist picker portal */}
            {playlistPickerTrackId && typeof window !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-[9995] flex items-end justify-center sm:items-center p-4"
                    onClick={() => setPlaylistPickerTrackId(null)}
                >
                    <div
                        className={`w-full max-w-sm rounded-2xl shadow-2xl flex flex-col overflow-hidden ${isDark ? 'bg-gray-900 ring-1 ring-white/10' : 'bg-white ring-1 ring-gray-200'}`}
                        onClick={e => e.stopPropagation()}
                    >
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
                            <div className="mx-5 mt-4 rounded-2xl px-4 py-3 text-xs bg-rose-500/10 text-rose-200 border border-rose-400/20">
                                {playlistPickerError}
                            </div>
                        )}
                        {playlistPickerLoading ? (
                            <div className="flex justify-center py-8">
                                <ListMusic className={`w-5 h-5 animate-pulse ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                            </div>
                        ) : playlistOptions.length === 0 ? (
                            <div className={`px-5 py-4 text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                {t('Chưa có playlist nào. Tạo playlist trong thư viện nhạc.', 'No playlists yet. Create one in the music library.', isVietnamese)}
                            </div>
                        ) : playlistOptions.map(pl => (
                            <button
                                key={pl.id}
                                onClick={() => { const track = slides.find(s => s.id === playlistPickerTrackId); void handleSaveToPlaylist(track, pl.id); }}
                                className={`flex items-center gap-3 px-5 py-3.5 text-sm transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-50 text-gray-700'}`}
                            >
                                <Plus className="w-4 h-4 text-emerald-400" />
                                <div className="text-left flex-1 min-w-0">
                                    <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{pl.name}</p>
                                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{pl.tracks.length} {t('bài', 'tracks', isVietnamese)}</p>
                                </div>
                            </button>
                        ))}
                        <div className="h-4" />
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
