'use client';

/**
 * TikTokMusicFeedClient — fullscreen snap-scroll audio feed
 * Loads all channel JSON files from /public/data/music/*.json
 * Swipe up/down between tracks, auto-play, seenIDs in localStorage.
 * Save button → download MP3 + save to playlist.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, ListMusic, Loader2, Music2, Check, SkipForward } from 'lucide-react';
import { getMusicPlaylists, addTrackToMusicPlaylist } from '@/services/musicPlaylistService';
import type { MusicPlaylist } from '@/services/musicPlaylistService';

interface TikTokTrack {
    id: string;
    title: string;
    artist: string;
    audioUrl: string;
    coverUrl?: string;
    durationSec?: number;
    channelSlug: string;
}

export interface TikTokMusicFeedClientProps {
    isVietnamese?: boolean;
    isDark?: boolean;
    /** Already-loaded playlists from parent — avoids redundant API call */
    playlistOptions?: MusicPlaylist[];
    /** Called after saving so parent can refresh its playlist state */
    onPlaylistsChanged?: () => void;
}

const CHANNEL_FILES = ['nhacviet-tiktok', 'nhac-soi-dong', 'background-music', 'nhac-en-chill', 'rap-tiktok'];
const SEEN_KEY = 'wordai-music-tiktok-seen';
const BATCH = 50;

export default function TikTokMusicFeedClient({
    isVietnamese = true,
    isDark = true,
    playlistOptions,
    onPlaylistsChanged,
}: TikTokMusicFeedClientProps) {
    const [tracks, setTracks] = useState<TikTokTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeIdx, setActiveIdx] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
    const [pickerTrack, setPickerTrack] = useState<TikTokTrack | null>(null);
    const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
    const [pickerLoading, setPickerLoading] = useState(false);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [savedNotif, setSavedNotif] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    // Refs — never stale in handlers
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
    const tracksRef = useRef<TikTokTrack[]>([]);
    const activeIdxRef = useRef(0);
    const preventIoRef = useRef(false);

    useEffect(() => { setIsMounted(true); }, []);
    useEffect(() => { tracksRef.current = tracks; }, [tracks]);
    useEffect(() => { activeIdxRef.current = activeIdx; }, [activeIdx]);

    // ── Load tracks ──────────────────────────────────────────────────────────
    const loadTracks = useCallback(async () => {
        setLoading(true);
        try {
            let seenIds: Set<string>;
            try { seenIds = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]); }
            catch { seenIds = new Set(); }

            const all: TikTokTrack[] = [];
            for (const slug of CHANNEL_FILES) {
                try {
                    const r = await fetch(`/data/music/${slug}.json`);
                    if (!r.ok) continue;
                    const data = await r.json() as { tracks?: Array<{ id: string; title?: string; artist?: string; audioUrl: string; coverUrl?: string; durationSec?: number }> };
                    for (const t of data.tracks ?? []) {
                        all.push({ id: t.id, title: t.title || '', artist: t.artist || '', audioUrl: t.audioUrl, coverUrl: t.coverUrl, durationSec: t.durationSec, channelSlug: slug });
                    }
                } catch { /* skip */ }
            }

            let unseen = all.filter(t => !seenIds.has(t.id));
            if (unseen.length < 20) { localStorage.removeItem(SEEN_KEY); unseen = all; }

            // Fisher-Yates shuffle
            for (let i = unseen.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [unseen[i], unseen[j]] = [unseen[j], unseen[i]];
            }

            setTracks(unseen.slice(0, BATCH));
            setActiveIdx(0);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void loadTracks(); }, [loadTracks]);

    // ── Create singleton Audio element ───────────────────────────────────────
    useEffect(() => {
        const audio = new Audio();
        audio.preload = 'metadata';
        audioRef.current = audio;

        audio.onplay = () => setIsPlaying(true);
        audio.onpause = () => setIsPlaying(false);
        audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
        audio.ondurationchange = () => { if (isFinite(audio.duration)) setDuration(audio.duration); };
        audio.onended = () => {
            const next = activeIdxRef.current + 1;
            if (next < tracksRef.current.length) {
                preventIoRef.current = true;
                const container = containerRef.current;
                if (container) container.scrollTo({ top: next * container.clientHeight, behavior: 'smooth' });
                setActiveIdx(next);
                setTimeout(() => { preventIoRef.current = false; }, 800);
            }
        };

        return () => {
            audio.pause();
            audio.src = '';
        };
    }, []); // once

    // ── Swap audio when activeIdx changes ────────────────────────────────────
    useEffect(() => {
        const track = tracks[activeIdx];
        const audio = audioRef.current;
        if (!track || !audio) return;

        // Mark as seen
        try {
            const seen = new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'));
            seen.add(track.id);
            localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
        } catch { /* ignore */ }

        audio.pause();
        audio.src = track.audioUrl;
        audio.load();
        setCurrentTime(0);
        setDuration(0);

        audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }, [activeIdx, tracks]); // tracks dep: fire after initial load

    // ── IntersectionObserver — detect user swipe ─────────────────────────────
    useEffect(() => {
        const container = containerRef.current;
        if (!container || tracks.length === 0) return;

        const observer = new IntersectionObserver(entries => {
            if (preventIoRef.current) return;
            for (const entry of entries) {
                if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                    const idx = Number((entry.target as HTMLElement).dataset.idx);
                    if (!isNaN(idx) && idx !== activeIdxRef.current) {
                        setActiveIdx(idx);
                    }
                }
            }
        }, { root: container, threshold: 0.6 });

        cardRefs.current.forEach(ref => { if (ref) observer.observe(ref); });
        return () => observer.disconnect();
    }, [tracks]);

    // ── Controls ─────────────────────────────────────────────────────────────
    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
    }, []);

    const goTo = useCallback((idx: number) => {
        if (idx < 0 || idx >= tracksRef.current.length) return;
        preventIoRef.current = true;
        const container = containerRef.current;
        if (container) container.scrollTo({ top: idx * container.clientHeight, behavior: 'smooth' });
        setActiveIdx(idx);
        setTimeout(() => { preventIoRef.current = false; }, 800);
    }, []);

    const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const audio = audioRef.current;
        if (!audio) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * (isFinite(audio.duration) ? audio.duration : 0);
    }, []);

    // ── Save: download MP3 + open playlist picker ─────────────────────────────
    const handleSave = useCallback(async (track: TikTokTrack) => {
        // Start download immediately (parallel with picker opening)
        setDownloadingId(track.id);
        void (async () => {
            try {
                const resp = await fetch(track.audioUrl);
                if (!resp.ok) throw new Error('fetch failed');
                const blob = await resp.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const name = `${track.artist ? track.artist + ' - ' : ''}${track.title || track.id}.mp3`.replace(/[/\\?%*:|"<>]/g, '_');
                a.href = url;
                a.download = name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 2000);
            } catch { /* silent */ } finally {
                setDownloadingId(null);
            }
        })();

        // Load playlists and show picker
        setPickerTrack(track);
        setPickerLoading(true);
        try {
            const pls = playlistOptions ?? await getMusicPlaylists();
            setPlaylists(pls);
        } catch { setPlaylists([]); }
        finally { setPickerLoading(false); }
    }, [playlistOptions]);

    const handleAddToPlaylist = useCallback(async (playlistId: string) => {
        if (!pickerTrack) return;
        try {
            await addTrackToMusicPlaylist(playlistId, {
                id: pickerTrack.id,
                title: pickerTrack.title,
                artist: pickerTrack.artist,
                audioUrl: pickerTrack.audioUrl,
                durationSec: pickerTrack.durationSec ?? 0,
                source: 'tiktok',
                thumbnailUrl: pickerTrack.coverUrl,
            });
            setSavedIds(prev => new Set(prev).add(pickerTrack.id));
            setPickerTrack(null);
            setSavedNotif(true);
            setTimeout(() => setSavedNotif(false), 2500);
            onPlaylistsChanged?.();
        } catch { /* ignore */ }
    }, [pickerTrack, onPlaylistsChanged]);

    // ── Render ───────────────────────────────────────────────────────────────
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    if (loading) return (
        <div className="h-full flex items-center justify-center bg-[#06060f]">
            <Loader2 className="w-8 h-8 animate-spin text-white/40" />
        </div>
    );

    if (tracks.length === 0) return (
        <div className="h-full flex items-center justify-center bg-[#06060f]">
            <div className="flex flex-col items-center gap-3">
                <Music2 className="w-12 h-12 text-white/20" />
                <p className="text-white/40 text-sm">{isVietnamese ? 'Không tải được nhạc' : 'Could not load music'}</p>
            </div>
        </div>
    );

    return (
        <div className="relative h-full w-full overflow-hidden bg-[#06060f]">
            {/* Snap-scroll container */}
            <div
                ref={containerRef}
                className="h-full overflow-y-scroll snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {tracks.map((t, idx) => (
                    <div
                        key={t.id}
                        ref={el => { cardRefs.current[idx] = el; }}
                        data-idx={idx}
                        className="relative flex-shrink-0 snap-start snap-always"
                        style={{ height: '100%', width: '100%' }}
                    >
                        {/* Cover image */}
                        {t.coverUrl
                            ? <img src={t.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                            : <div className="absolute inset-0 bg-gradient-to-br from-violet-900 via-gray-900 to-black" />
                        }
                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/90" />

                        {/* Tap-to-play/pause overlay (active card only) */}
                        {idx === activeIdx && (
                            <button
                                onClick={togglePlay}
                                className="absolute inset-0 w-full h-full cursor-pointer"
                                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                            />
                        )}

                        {/* Paused indicator */}
                        {idx === activeIdx && !isPlaying && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                                    <Play className="w-9 h-9 text-white ml-1" fill="white" />
                                </div>
                            </div>
                        )}

                        {/* Bottom info + seek bar */}
                        <div className="absolute bottom-0 left-0 right-20 px-5 pb-6 pt-24">
                            <p className="text-white font-bold text-lg leading-snug line-clamp-2 drop-shadow-lg">
                                {t.title || (isVietnamese ? 'Nhạc TikTok' : 'TikTok Music')}
                            </p>
                            <p className="text-white/70 text-sm mt-1 drop-shadow">{t.artist || '—'}</p>

                            {/* Seek bar — only active card */}
                            {idx === activeIdx && (
                                <div className="mt-4">
                                    <div
                                        className="w-full h-1.5 bg-white/25 rounded-full overflow-hidden cursor-pointer"
                                        onClick={handleSeek}
                                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                                    >
                                        <div
                                            className="h-full bg-white rounded-full"
                                            style={{ width: `${progress}%`, transition: 'width 0.15s linear' }}
                                        />
                                    </div>
                                    <div className="flex justify-between mt-1.5">
                                        <span className="text-white/50 text-[10px]">{fmt(currentTime)}</span>
                                        <span className="text-white/50 text-[10px]">{fmt(duration)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right-side action buttons */}
                        <div className="absolute right-4 bottom-24 flex flex-col items-center gap-5">
                            {/* Save + Download */}
                            <button
                                onClick={e => { e.stopPropagation(); if (idx === activeIdx) void handleSave(t); }}
                                disabled={downloadingId === t.id}
                                className="flex flex-col items-center gap-1.5"
                                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                            >
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ${
                                    savedIds.has(t.id)
                                        ? 'bg-pink-500'
                                        : 'bg-black/50 backdrop-blur-sm border border-white/20'
                                }`}>
                                    {downloadingId === t.id
                                        ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                                        : savedIds.has(t.id)
                                            ? <Check className="w-5 h-5 text-white" />
                                            : <ListMusic className="w-5 h-5 text-white" />
                                    }
                                </div>
                                <span className="text-white/80 text-[10px] drop-shadow">{isVietnamese ? 'Lưu' : 'Save'}</span>
                            </button>

                            {/* Skip next */}
                            <button
                                onClick={e => { e.stopPropagation(); goTo(activeIdx + 1); }}
                                className="flex flex-col items-center gap-1.5"
                                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                            >
                                <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg">
                                    <SkipForward className="w-5 h-5 text-white" />
                                </div>
                                <span className="text-white/80 text-[10px] drop-shadow">{isVietnamese ? 'Bỏ qua' : 'Skip'}</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Track counter top-right */}
            <div className="absolute top-4 left-4 z-10 pointer-events-none">
                <span className="text-white/40 text-xs tabular-nums">{activeIdx + 1} / {tracks.length}</span>
            </div>

            {/* Shuffle again — reload new random batch */}
            <button
                onClick={() => { setTracks([]); void loadTracks(); }}
                className="absolute top-3 right-3 z-10 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 text-white/60 hover:text-white text-xs transition-colors"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
                ↺ {isVietnamese ? 'Trộn lại' : 'Shuffle'}
            </button>

            {/* Saved notification */}
            {isMounted && savedNotif && createPortal(
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[600] px-5 py-2.5 bg-white/10 backdrop-blur-md rounded-full text-white text-sm border border-white/20 shadow-xl pointer-events-none">
                    ✓ {isVietnamese ? 'Đã lưu vào playlist' : 'Saved to playlist'}
                </div>,
                document.body
            )}

            {/* Playlist picker bottom sheet */}
            {isMounted && pickerTrack && createPortal(
                <div
                    className="fixed inset-0 z-[510] bg-black/70 backdrop-blur-sm flex items-end justify-center"
                    onClick={() => setPickerTrack(null)}
                >
                    <div
                        className="w-full max-w-sm bg-gray-900 rounded-t-3xl p-5 pb-8"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Handle */}
                        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />
                        {/* Track info */}
                        <p className="text-white font-semibold text-sm mb-0.5 truncate">{pickerTrack.title}</p>
                        <p className="text-gray-400 text-xs mb-4 truncate">{pickerTrack.artist}</p>
                        <p className="text-gray-500 text-xs mb-3">
                            {isVietnamese ? 'Lưu vào playlist:' : 'Save to playlist:'}
                        </p>
                        {pickerLoading ? (
                            <div className="flex justify-center py-6">
                                <Loader2 className="w-5 h-5 animate-spin text-white/40" />
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                                {playlists.length === 0 && (
                                    <p className="text-gray-500 text-sm text-center py-3">
                                        {isVietnamese ? 'Chưa có playlist nào' : 'No playlists yet'}
                                    </p>
                                )}
                                {playlists.map(pl => (
                                    <button
                                        key={pl.id}
                                        onClick={() => void handleAddToPlaylist(pl.id)}
                                        className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] active:scale-[0.97] transition-all text-left"
                                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                                    >
                                        <ListMusic className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                                        <span className="text-white text-sm truncate">{pl.name}</span>
                                        {pl.tracks.some(t => t.id === pickerTrack.id) && (
                                            <Check className="w-3.5 h-3.5 text-green-400 ml-auto flex-shrink-0" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

function fmt(s: number) {
    if (!s || !isFinite(s)) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
