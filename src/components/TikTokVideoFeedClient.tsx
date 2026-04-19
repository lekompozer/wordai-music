'use client';

/**
 * TikTokVideoFeedClient — fullscreen snap-scroll MP4 video feed
 * Loads all 6 music channel JSON files from /public/data/channels/
 * Uses VIDEO POOLING pattern: one shared <video> element, moved across cards.
 * Swipe up/down between videos. seenIDs stored in localStorage.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Volume2, VolumeX, ChevronUp, ChevronDown,
    Loader2, Bookmark, BookmarkCheck, Check, Music2, Play, Pause,
} from 'lucide-react';
import { getMusicPlaylists, addTrackToMusicPlaylist } from '@/services/musicPlaylistService';
import type { MusicPlaylist } from '@/services/musicPlaylistService';
import type { PlaylistTrack } from '@/services/musicService';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VideoItem {
    id: string;
    channelSlug: string;
    channelName: string;
    coverUrl: string;
    videoUrl: string;
    caption: string;
}

export interface TikTokVideoFeedClientProps {
    isVietnamese?: boolean;
    isDark?: boolean;
    playlistOptions?: MusicPlaylist[];
    onPlaylistsChanged?: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHANNEL_FILES: { slug: string; name: string }[] = [
    { slug: 'emer-clubz', name: 'Emer.Clubz' },
    { slug: 'mewlyra', name: 'MewLyra' },
    { slug: 'nhac-nay-nghe-la-nghien', name: 'Nhạc Nay Nghe Là Nghiền' },
    { slug: 'rap-zone', name: 'Rapzone' },
    { slug: 'fruity-music', name: 'FruityMusic' },
    { slug: '1987vibes-vn', name: '1987vibesvn' },
];

const SEEN_KEY = 'wordai-music-tiktok-video-seen';

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
}

// ─── Video pool — ONE shared <video> element ──────────────────────────────────

let pooledVideo: HTMLVideoElement | null = null;

function getPooledVideo(): HTMLVideoElement {
    if (!pooledVideo) {
        pooledVideo = document.createElement('video');
        pooledVideo.playsInline = true;
        pooledVideo.loop = false;
        pooledVideo.preload = 'auto';
        pooledVideo.setAttribute('webkit-playsinline', 'true');
        pooledVideo.muted = true;
        Object.assign(pooledVideo.style, {
            position: 'absolute',
            inset: '0',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
        });
    }
    return pooledVideo;
}

// ─── Blob URL cache (module-level → survives component remounts) ────────────
const videoBlobCache = new Map<string, string>();   // originalUrl → blobUrl
const videoFetching  = new Set<string>();            // in-flight guard
const BLOB_CACHE_MAX = 8;
let   pooledVideoLogicalUrl = '';                    // tracks which URL is in pooled video

/** Start fetching `url` as a blob, store in cache when ready. Fire-and-forget. */
function prefetchVideo(url: string): void {
    if (videoBlobCache.has(url) || videoFetching.has(url)) return;
    videoFetching.add(url);
    fetch(url)
        .then(r => { if (!r.ok) throw new Error('fetch failed'); return r.blob(); })
        .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            if (videoBlobCache.size >= BLOB_CACHE_MAX) {
                const oldest = videoBlobCache.keys().next().value;
                if (oldest) { URL.revokeObjectURL(videoBlobCache.get(oldest)!); videoBlobCache.delete(oldest); }
            }
            videoBlobCache.set(url, blobUrl);
        })
        .catch(() => { /* ignore network errors */ })
        .finally(() => { videoFetching.delete(url); });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TikTokVideoFeedClient({
    isVietnamese = true,
    isDark = true,
    playlistOptions,
    onPlaylistsChanged,
}: TikTokVideoFeedClientProps) {
    const [items, setItems] = useState<VideoItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeIdx, setActiveIdx] = useState(0);
    const [isMuted, setIsMuted] = useState(true);
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
    const [pickerItem, setPickerItem] = useState<VideoItem | null>(null);
    const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
    const [pickerLoading, setPickerLoading] = useState(false);
    const [savedNotif, setSavedNotif] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    const containerRef = useRef<HTMLDivElement | null>(null);
    const snapRef = useRef<HTMLDivElement | null>(null);
    const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
    const itemsRef = useRef<VideoItem[]>([]);
    const activeIdxRef = useRef(0);
    const isMutedRef = useRef(true);
    const preventIoRef = useRef(false);
    const videoMountedRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => { setIsMounted(true); }, []);
    useEffect(() => { itemsRef.current = items; }, [items]);
    useEffect(() => { activeIdxRef.current = activeIdx; }, [activeIdx]);
    useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

    // ── Load videos ───────────────────────────────────────────────────────────
    const loadItems = useCallback(async () => {
        setLoading(true);
        try {
            let seenIds: Set<string>;
            try { seenIds = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]); }
            catch { seenIds = new Set(); }

            const all: VideoItem[] = [];
            for (const ch of CHANNEL_FILES) {
                try {
                    const res = await fetch(`/data/channels/${ch.slug}.json`);
                    if (!res.ok) continue;
                    const data = await res.json() as { items?: Array<{ id: string; coverUrl?: string; videoUrl?: string; caption?: string; hasVideo?: boolean }> };
                    const channelItems: VideoItem[] = (data.items ?? [])
                        .filter(v => v.hasVideo && v.videoUrl)
                        .map(v => ({
                            id: v.id,
                            channelSlug: ch.slug,
                            channelName: ch.name,
                            coverUrl: v.coverUrl ?? '',
                            videoUrl: v.videoUrl!,
                            caption: v.caption ?? '',
                        }));
                    all.push(...channelItems);
                } catch { /* skip channel */ }
            }

            if (all.length === 0) { setLoading(false); return; }

            // Filter out seen, fall back to all if too few remain
            const unseen = all.filter(v => !seenIds.has(v.id));
            const pool = unseen.length >= 10 ? unseen : all;
            setItems(shuffle(pool));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadItems(); }, [loadItems]);

    // ── Mount pooled video into active card ───────────────────────────────────
    const mountVideoToCard = useCallback((idx: number, forcePlay = false) => {
        const video = getPooledVideo();
        const card = cardRefs.current[idx];
        if (!card) return;

        // Move video into this card
        if (video.parentElement !== card) {
            card.appendChild(video);
            videoMountedRef.current = card;
        }

        // Change source if needed — prefer cached blob URL so re-plays are instant
        const item = itemsRef.current[idx];
        if (!item) return;
        if (pooledVideoLogicalUrl !== item.videoUrl) {
            pooledVideoLogicalUrl = item.videoUrl;
            video.src = videoBlobCache.get(item.videoUrl) ?? item.videoUrl;
        }

        video.muted = isMutedRef.current;
        if (forcePlay || !video.paused) {
            video.play().catch(() => { video.muted = true; isMutedRef.current = true; setIsMuted(true); video.play().catch(() => { }); });
        }
    }, []);

    // ── IntersectionObserver — detect active card ─────────────────────────────
    useEffect(() => {
        if (items.length === 0) return;

        const io = new IntersectionObserver(entries => {
            if (preventIoRef.current) return;
            for (const e of entries) {
                if (!e.isIntersecting) continue;
                const idx = cardRefs.current.findIndex(r => r === e.target);
                if (idx < 0 || idx === activeIdxRef.current) continue;
                activeIdxRef.current = idx;
                setActiveIdx(idx);
                mountVideoToCard(idx, true);

                // Mark seen
                try {
                    const seenArr = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[];
                    const seen = new Set(seenArr);
                    seen.add(itemsRef.current[idx]!.id);
                    const trimmed = Array.from(seen).slice(-2000);
                    localStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
                } catch { /* ignore */ }
            }
        }, { threshold: 0.7 });

        cardRefs.current.slice(0, items.length).forEach(card => { if (card) io.observe(card); });
        // Play first card
        setTimeout(() => mountVideoToCard(0, true), 100);

        return () => io.disconnect();
    }, [items, mountVideoToCard]);

    // ── Pause video on unmount ────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            if (pooledVideo) { pooledVideo.pause(); pooledVideo.src = ''; pooledVideoLogicalUrl = ''; }
        };
    }, []);

    // ── Navigation ────────────────────────────────────────────────────────────
    const goTo = useCallback((idx: number) => {
        if (idx < 0 || idx >= itemsRef.current.length) return;
        preventIoRef.current = true;
        const card = cardRefs.current[idx];
        if (card && snapRef.current) {
            snapRef.current.scrollTop = idx * snapRef.current.clientHeight;
        }
        activeIdxRef.current = idx;
        setActiveIdx(idx);
        mountVideoToCard(idx, true);
        setTimeout(() => { preventIoRef.current = false; }, 500);
    }, [mountVideoToCard]);

    // ── Auto-advance when video ends ──────────────────────────────────────────
    const goToRef = useRef<(idx: number) => void>(() => {});
    useEffect(() => { goToRef.current = goTo; }, [goTo]);

    useEffect(() => {
        const video = getPooledVideo();
        const handleEnded = () => {
            const next = activeIdxRef.current + 1;
            if (next < itemsRef.current.length) goToRef.current(next);
        };
        video.addEventListener('ended', handleEnded);
        return () => video.removeEventListener('ended', handleEnded);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Preload next 2 videos as blob URLs ────────────────────────────────────
    useEffect(() => {
        for (let i = 1; i <= 2; i++) {
            const item = items[activeIdx + i];
            if (item) prefetchVideo(item.videoUrl);
        }
    }, [activeIdx, items]);

    // ── Tap to play/pause ──────────────────────────────────────────────────────
    const [showIcon, setShowIcon] = useState<'play' | 'pause' | null>(null);
    const iconTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleTap = useCallback(() => {
        const video = getPooledVideo();
        if (video.paused) {
            video.play().catch(() => { });
            setShowIcon('play');
        } else {
            video.pause();
            setShowIcon('pause');
        }
        if (iconTimerRef.current) clearTimeout(iconTimerRef.current);
        iconTimerRef.current = setTimeout(() => setShowIcon(null), 800);
    }, []);

    // ── Mute toggle ───────────────────────────────────────────────────────────
    const handleToggleMute = useCallback(() => {
        const video = getPooledVideo();
        const newMuted = !isMutedRef.current;
        isMutedRef.current = newMuted;
        video.muted = newMuted;
        if (!newMuted) {
            video.play().catch(() => { video.muted = true; isMutedRef.current = true; setIsMuted(true); });
        }
        setIsMuted(newMuted);
    }, []);

    // ── Save to playlist ──────────────────────────────────────────────────────
    const handleOpenPicker = useCallback(async (item: VideoItem) => {
        setPickerItem(item);
        setPickerLoading(true);
        try {
            const opts = playlistOptions ?? await getMusicPlaylists();
            setPlaylists(opts ?? []);
        } finally {
            setPickerLoading(false);
        }
    }, [playlistOptions]);

    const handleSaveToPlaylist = useCallback(async (playlistId: string) => {
        if (!pickerItem) return;
        const track: PlaylistTrack = {
            id: pickerItem.id,
            title: pickerItem.caption || pickerItem.channelName,
            artist: pickerItem.channelName,
            audioUrl: '',
            durationSec: 0,
            source: 'tiktok',
            thumbnailUrl: pickerItem.coverUrl,
            tiktokId: pickerItem.id,
            isVideo: true,
        };
        await addTrackToMusicPlaylist(playlistId, track);
        const s = new Set(savedIds);
        s.add(pickerItem.id);
        setSavedIds(s);
        setPickerItem(null);
        setSavedNotif(true);
        onPlaylistsChanged?.();
        setTimeout(() => setSavedNotif(false), 2000);
    }, [pickerItem, savedIds, onPlaylistsChanged]);

    // ── Render ────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="h-full w-full flex items-center justify-center bg-[#06060f]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
                    <p className="text-white/40 text-sm">{isVietnamese ? 'Đang tải...' : 'Loading...'}</p>
                </div>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="h-full w-full flex items-center justify-center bg-[#06060f]">
                <p className="text-white/40 text-sm">{isVietnamese ? 'Không có video' : 'No videos'}</p>
            </div>
        );
    }

    return (
        <>
            <div ref={containerRef} className="h-full w-full relative bg-black overflow-hidden">
                {/* Desktop prev / next */}
                <div className="hidden lg:flex absolute right-4 top-1/2 -translate-y-1/2 flex-col gap-2 z-40">
                    <button
                        onClick={() => goTo(activeIdx - 1)}
                        disabled={activeIdx === 0}
                        className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors disabled:opacity-30"
                    >
                        <ChevronUp className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => goTo(activeIdx + 1)}
                        disabled={activeIdx >= items.length - 1}
                        className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors disabled:opacity-30"
                    >
                        <ChevronDown className="w-5 h-5" />
                    </button>
                </div>

                {/* Snap scroll container */}
                <div
                    ref={snapRef}
                    className="h-full w-full overflow-y-scroll snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                    {items.map((item, i) => (
                        <div
                            key={`${item.id}-${i}`}
                            ref={el => { cardRefs.current[i] = el; }}
                            className="relative w-full flex-shrink-0 snap-start overflow-hidden bg-black select-none"
                            style={{ height: '100%', minHeight: '100%' }}
                            onClick={i === activeIdx ? handleTap : undefined}
                        >
                            {/* Thumbnail — always visible behind video */}
                            <img
                                src={item.coverUrl}
                                alt={item.caption}
                                className="absolute inset-0 w-full h-full object-cover"
                                loading={i === 0 ? 'eager' : 'lazy'}
                            />

                            {/* Channel badge — top center, like music card */}
                            <div className="absolute top-[72px] left-0 right-0 flex justify-center z-20 pointer-events-none">
                                <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 bg-white/10 border border-white/20 backdrop-blur-sm">
                                    <Music2 className="w-3 h-3 text-white/80" />
                                    <span className="text-xs font-medium text-white/80">{item.channelName}</span>
                                </div>
                            </div>

                            {/* Bottom gradient — same as SlideCard */}
                            <div
                                className="absolute inset-x-0 bottom-0 h-2/5 pointer-events-none z-10"
                                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)' }}
                            />

                            {/* Bottom info — matches SlideCard layout exactly */}
                            <div className="absolute bottom-0 left-4 right-16 pb-10 z-20 pointer-events-none">
                                <p className="text-white font-bold text-lg leading-tight truncate drop-shadow">
                                    {item.caption || item.channelName}
                                </p>
                                <p className="text-white/65 text-sm mt-0.5 truncate">{item.channelName}</p>
                            </div>

                            {/* Right action buttons — same style as SlideCard mobile buttons */}
                            {i === activeIdx && (
                                <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-4">
                                    <button
                                        onClick={e => { e.stopPropagation(); handleOpenPicker(item); }}
                                        className={`w-11 h-11 rounded-full backdrop-blur-sm flex items-center justify-center border border-white/10 transition-colors ${savedIds.has(item.id)
                                                ? 'bg-yellow-500/30 text-yellow-400'
                                                : 'bg-black/30 text-white hover:bg-black/50'
                                            }`}
                                        aria-label="Save to playlist"
                                    >
                                        {savedIds.has(item.id) ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
                                    </button>
                                    <button
                                        onClick={e => { e.stopPropagation(); handleToggleMute(); }}
                                        className="w-11 h-11 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center border border-white/10 text-white hover:bg-black/50 transition-colors"
                                        aria-label={isMuted ? 'Unmute' : 'Mute'}
                                    >
                                        {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                                    </button>
                                </div>
                            )}

                            {/* Tap flash icon — same as SlideCard */}
                            {i === activeIdx && showIcon && (
                                <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                                    <div
                                        className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center"
                                        style={{ animation: 'videoIconPop 0.8s ease forwards' }}
                                    >
                                        {showIcon === 'pause'
                                            ? <Pause className="w-8 h-8 text-white" />
                                            : <Play className="w-8 h-8 text-white ml-1" />}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Saved notification */}
                {savedNotif && (
                    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-green-600 text-white text-sm font-medium shadow-lg">
                        <Check className="w-4 h-4" />
                        {isVietnamese ? 'Đã lưu!' : 'Saved!'}
                    </div>
                )}
            </div>

            {/* Playlist picker portal */}
            {isMounted && pickerItem && createPortal(
                <div className="fixed inset-0 z-[9999] flex flex-col justify-end">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPickerItem(null)} />
                    <div className={`relative z-10 rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
                        <div className={`flex-shrink-0 flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                            <p className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {isVietnamese ? 'Lưu vào playlist' : 'Save to playlist'}
                            </p>
                            <button onClick={() => setPickerItem(null)} className={`text-sm ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}>
                                {isVietnamese ? 'Hủy' : 'Cancel'}
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {pickerLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className={`w-5 h-5 animate-spin ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                                </div>
                            ) : playlists.length === 0 ? (
                                <p className={`text-center py-6 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {isVietnamese ? 'Chưa có playlist nào' : 'No playlists yet'}
                                </p>
                            ) : (
                                playlists.map(pl => (
                                    <button
                                        key={pl.id}
                                        onClick={() => handleSaveToPlaylist(pl.id)}
                                        className={`w-full text-left px-4 py-3 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-800 text-white' : 'hover:bg-gray-100 text-gray-900'}`}
                                    >
                                        <p className="font-medium text-sm">{pl.name}</p>
                                        <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            {(pl.tracks?.length ?? 0)} {isVietnamese ? 'bài' : 'tracks'}
                                        </p>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
