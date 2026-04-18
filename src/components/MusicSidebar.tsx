'use client';

import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import { createPortal } from 'react-dom';
import { HomeSidebarCollapsedCtx } from './HomeShell';
import {
    X, Search, Music2, AudioWaveform, Shuffle, ChevronDown, ChevronRight, ChevronLeft, Play, Plus,
    Trash2, ListMusic, Youtube, Link as LinkIcon, Loader2,
    Check, PlayCircle, Upload, Radio, Flame, Sparkles, Globe, Heart,
    HardDrive, FolderOpen, FilePlus2,
} from 'lucide-react';
import {
    searchYouTube, importYouTube, importTikTok,
    trackMetaToPlaylist, uploadLocalAudioToR2,
    type YTSearchResult, type PlaylistTrack,
} from '@/services/musicService';
import {
    MUSIC_PLAYLISTS_UPDATED_EVENT,
    addTrackToMusicPlaylist,
    createMusicPlaylist,
    deleteMusicPlaylist,
    getMusicPlaylists,
    removeTrackFromMusicPlaylist,
    renamePlaylistTrack,
    type MusicPlaylist,
} from '@/services/musicPlaylistService';
import {
    publishPlaylistAsChannel,
    unpublishChannel,
    updateChannelMetadata,
    getPublicMusicChannels,
    toggleChannelLike,
    getChannelStats,
    type PublicMusicChannel,
    type ChannelLikeStats,
    type ChannelMeta,
} from '@/services/musicChannelService';
import { fetchTrackPlays } from '@/services/musicService';
import { setSessionBlob, extractFileDuration, cacheAudioBlob } from '@/lib/audioCache';

import { useWordaiAuth } from '@/contexts/WordaiAuthContext';

import type { LocalPlaylist } from '@/lib/localLibrary';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Playlist = MusicPlaylist;

export interface SidebarChannel {
    slug: string;
    name: string;
    label: string;
    accent: string;
}

export interface SidebarTrack {
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
    facebookIsReel?: boolean;
}

export interface MusicSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    channels: SidebarChannel[];
    selectedChannelSlug: string;
    onSelectChannel: (slug: string) => void;
    onPlayTracks: (tracks: SidebarTrack[], startIndex?: number, playlistId?: string, playlistName?: string) => void;
    onLoadChannelTracks: (slug: string) => Promise<SidebarTrack[]>;
    isDark: boolean;
    isVietnamese: boolean;
    desktopPinned?: boolean;
    currentTrackId?: string;
    isShuffle?: boolean;
    onToggleShuffle?: () => void;
    /** Left offset in px — override the HomeSidebarCollapsedCtx-based calculation.
     *  Pass 0 in standalone apps (wordai-music) where no parent sidebar exists. */
    leftOffset?: number;
    /** Top offset in px — used to leave room for TitleBarStyle::Overlay traffic lights.
     *  Pass 28 in wordai-music so the drag area above MusicHeader stays accessible. */
    topOffset?: number;
    onOpenShorts?: () => void;
    isShortsActive?: boolean;
}

function fmtDur(sec: number): string {
    if (!sec) return '';
    return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = 'channels' | 'search' | 'import' | 'playlists' | 'local';

// ─── Sub-component: ChannelTrackList ─────────────────────────────────────────

function ChannelTrackList({
    slug, onLoadTracks, onPlayTracks, accent, isDark, currentTrackId, onTotalPlays,
}: {
    slug: string;
    onLoadTracks: (slug: string) => Promise<SidebarTrack[]>;
    onPlayTracks: (tracks: SidebarTrack[], startIndex?: number) => void;
    accent: string;
    isDark: boolean;
    currentTrackId?: string;
    onTotalPlays?: (slug: string, total: number) => void;
}) {
    const [tracks, setTracks] = useState<SidebarTrack[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [playCounts, setPlayCounts] = useState<Record<string, number>>({});

    useEffect(() => {
        setLoading(true);
        onLoadTracks(slug).then(async t => {
            setTracks(t);
            setLoading(false);
            if (t.length > 0) {
                const counts = await fetchTrackPlays(t.map(tr => tr.id));
                setPlayCounts(counts);
                const total = Object.values(counts).reduce((s, n) => s + n, 0);
                onTotalPlays?.(slug, total);
            }
        }).catch(() => setLoading(false));
    }, [slug, onLoadTracks]);

    if (loading) return (
        <div className="py-4 flex justify-center">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: accent }} />
        </div>
    );

    if (!tracks || tracks.length === 0) return (
        <p className={`py-2 px-3 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No tracks</p>
    );

    return (
        <div className="flex flex-col">
            <button
                onClick={() => onPlayTracks(tracks, 0)}
                className="mx-3 mb-2 mt-1 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-all"
                style={{ background: accent }}
            >
                <PlayCircle className="w-3.5 h-3.5" />
                Play all ({tracks.length})
            </button>
            <div className={`mx-2 mb-2 max-h-[72vh] overflow-y-auto rounded-xl pr-1 [scrollbar-width:auto] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full ${isDark ? '[&::-webkit-scrollbar-track]:bg-gray-900/60 [&::-webkit-scrollbar-thumb]:bg-gray-700' : '[&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300'}`}>
                {tracks.map((t, i) => {
                    const isActivePlaying = !!currentTrackId && t.id === currentTrackId;
                    return (
                        <button
                            key={t.id}
                            onClick={() => onPlayTracks(tracks, i)}
                            className={`group flex w-full items-center gap-2 px-3 py-2.5 text-left rounded-xl transition-all active:scale-[0.98] ${isActivePlaying
                                ? (isDark ? 'bg-white/[0.08]' : 'bg-black/[0.04]')
                                : (isDark ? 'hover:bg-white/[0.08]' : 'hover:bg-black/[0.05]')
                                }`}
                        >
                            <div className="w-5 flex-shrink-0 flex items-center justify-center">
                                {isActivePlaying ? (
                                    <AudioWaveform className="w-3.5 h-3.5 animate-pulse" style={{ color: accent }} />
                                ) : (
                                    <>
                                        <span className={`text-[10px] text-right group-hover:hidden ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{i + 1}</span>
                                        <Play className="w-3 h-3 hidden group-hover:block fill-current" style={{ color: accent }} />
                                    </>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-xs font-medium truncate ${isActivePlaying ? '' : (isDark ? 'text-gray-200' : 'text-gray-800')}`}
                                    style={isActivePlaying ? { color: accent } : undefined}>
                                    {t.title || 'Unknown'}
                                </p>
                                {t.artist && (
                                    <p className={`text-[10px] truncate ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                        {t.artist}
                                    </p>
                                )}
                            </div>
                            {t.durationSec > 0 && (
                                <span className={`text-[10px] flex-shrink-0 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                                    {fmtDur(t.durationSec)}
                                </span>
                            )}
                            {(playCounts[t.id] ?? 0) > 0 && (
                                <span className={`text-[10px] flex-shrink-0 tabular-nums ${isDark ? 'text-gray-500' : 'text-gray-400'}`}
                                    title={isActivePlaying ? undefined : `${playCounts[t.id]} plays`}>
                                    {playCounts[t.id] >= 1000
                                        ? `${(playCounts[t.id] / 1000).toFixed(1)}k`
                                        : playCounts[t.id]}▶
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── User channel type ────────────────────────────────────────────────────────

interface UserChannel {
    id: string;
    name: string;
    label: string;
    accent: string;
    createdAt: number;
}

const USER_CHANNELS_KEY = 'music_user_channels';

function loadUserChannels(): UserChannel[] {
    try {
        const raw = localStorage.getItem(USER_CHANNELS_KEY);
        return raw ? (JSON.parse(raw) as UserChannel[]) : [];
    } catch { return []; }
}

function saveUserChannels(channels: UserChannel[]) {
    try { localStorage.setItem(USER_CHANNELS_KEY, JSON.stringify(channels)); } catch { /* ignore */ }
}

// ─── Main MusicSidebar ────────────────────────────────────────────────────────

export default function MusicSidebar({
    isOpen, onClose, channels, selectedChannelSlug,
    onSelectChannel, onPlayTracks, onLoadChannelTracks, isDark, isVietnamese, desktopPinned = false,
    currentTrackId, isShuffle = true, onToggleShuffle,
    leftOffset, topOffset = 0, onOpenShorts, isShortsActive
}: MusicSidebarProps) {
    const homeSidebarCollapsed = useContext(HomeSidebarCollapsedCtx);
    const { user } = useWordaiAuth();
    const [mounted, setMounted] = useState(false);
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [shortsOpen, setShortsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>(() => {
        if (typeof window === 'undefined') return 'channels';
        try {
            const raw = localStorage.getItem('music_last_ctx');
            if (!raw) return 'channels';
            const ctx = JSON.parse(raw) as { type: string };
            return ctx.type === 'playlist' ? 'playlists' : 'channels';
        } catch { return 'channels'; }
    });
    const [channelSearch, setChannelSearch] = useState('');
    const [expandedChannel, setExpandedChannel] = useState<string | null>(null);

    // YouTube search state
    const [ytQuery, setYtQuery] = useState('');
    const [ytResults, setYtResults] = useState<YTSearchResult[]>([]);
    const [ytLoading, setYtLoading] = useState(false);
    const [ytError, setYtError] = useState('');
    const [selectedYtId, setSelectedYtId] = useState<string | null>(null);
    const [importingYtId, setImportingYtId] = useState<string | null>(null);

    // URL import state
    const [importUrl, setImportUrl] = useState('');
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState('');
    const [importedTrack, setImportedTrack] = useState<PlaylistTrack | null>(null);

    // URL-to-playlist state (instant, no server needed)
    const [urlLinkInput, setUrlLinkInput] = useState('');
    const [urlLinkError, setUrlLinkError] = useState('');

    // Playlists state
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [playlistsLoading, setPlaylistsLoading] = useState(false);
    const [playlistError, setPlaylistError] = useState('');
    const [expandedPlaylist, setExpandedPlaylist] = useState<string | null>(null);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [creatingPlaylist, setCreatingPlaylist] = useState(false);

    // Add-to-playlist picker
    const [addingTrack, setAddingTrack] = useState<PlaylistTrack | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [addedYtIds, setAddedYtIds] = useState<Set<string>>(new Set());
    const [importedTrackAdded, setImportedTrackAdded] = useState(false);
    const pendingYtId = useRef<string | null>(null);

    // Upload MP3 state
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const [uploadFiles, setUploadFiles] = useState<File[]>([]);
    const [uploadTargetId, setUploadTargetId] = useState<string>('');
    const [uploadNewName, setUploadNewName] = useState('');
    const [uploadProcessing, setUploadProcessing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    // Local library state (localStorage-backed)
    const [localPlaylists, setLocalPlaylists] = useState<LocalPlaylist[]>([]);
    const [localProcessing, setLocalProcessing] = useState(false);
    const [localError, setLocalError] = useState('');
    const [expandedLocalPlaylist, setExpandedLocalPlaylist] = useState<string | null>(null);
    // Confirmation dialog for delete playlist (null = closed, string = playlist id pending deletion)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // User channels (stored in localStorage)
    const [userChannels, setUserChannels] = useState<UserChannel[]>([]);
    // View All popup state
    const [viewAllOpen, setViewAllOpen] = useState(false);
    const [viewAllSearch, setViewAllSearch] = useState('');
    const [viewAllPage, setViewAllPage] = useState(0);
    // Per-playlist track search query
    const [plTrackSearch, setPlTrackSearch] = useState<Record<string, string>>({});
    // Published channels (community)
    const [publicChannels, setPublicChannels] = useState<PublicMusicChannel[]>([]);
    const [publishedIds, setPublishedIds] = useState<Set<string>>(new Set());
    const [publishingId, setPublishingId] = useState<string | null>(null);
    // Channel like stats (keyed by channel slug or UUID)
    const [channelStats, setChannelStats] = useState<Record<string, ChannelLikeStats>>({});
    const [likingChannelId, setLikingChannelId] = useState<string | null>(null);
    // Total play counts per channel (loaded lazily when channel is expanded)
    const [channelTotalPlays, setChannelTotalPlays] = useState<Record<string, number>>({});
    const handleChannelTotalPlays = useCallback((slug: string, total: number) => {
        setChannelTotalPlays(prev => prev[slug] === total ? prev : { ...prev, [slug]: total });
    }, []);
    // Publish channel modal
    const [publishModalOpen, setPublishModalOpen] = useState(false);
    const [publishModalPlaylist, setPublishModalPlaylist] = useState<Playlist | null>(null);
    const [publishMeta, setPublishMeta] = useState<ChannelMeta & { name: string }>({ name: '', accent: '#4f46e5', description: '', genre: 'mixed', mood: '', tags: '' });
    // Track context menu (right-click)
    const [contextMenu, setContextMenu] = useState<{ trackId: string; playlistId: string; trackTitle: string; x: number; y: number } | null>(null);
    // Inline rename state
    const [renamingTrack, setRenamingTrack] = useState<{ playlistId: string; trackId: string; value: string } | null>(null);
    // Create Channel modal state
    const [createChOpen, setCreateChOpen] = useState(false);
    const [createChName, setCreateChName] = useState('');
    const [createChLabel, setCreateChLabel] = useState('');
    const ACCENT_OPTIONS = ['#4f46e5', '#2563eb', '#7c3aed', '#0f766e', '#db2777', '#ea580c', '#16a34a'];
    const [createChAccent, setCreateChAccent] = useState(ACCENT_OPTIONS[0]);

    // ── Shorts tab state ──────────────────────────────────────────────────────
    const [shortsLang, setShortsLang] = useState<'vi' | 'en'>('vi');
    const [shortsItems, setShortsItems] = useState<Array<{ youtube_id: string; title: string; channel: string; thumbnail: string; duration_sec: number }>>([]);
    const [shortsLoading, setShortsLoading] = useState(false);

    // ── Resizable sidebar ─────────────────────────────────────────────────────
    const [sidebarWidth, setSidebarWidth] = useState(320);
    const isResizing = useRef(false);
    const resizeStartX = useRef(0);
    const resizeStartW = useRef(0);
    const handleResizeStart = (e: React.MouseEvent) => {
        isResizing.current = true;
        resizeStartX.current = e.clientX;
        resizeStartW.current = sidebarWidth;
        const onMove = (ev: MouseEvent) => {
            if (!isResizing.current) return;
            setSidebarWidth(Math.max(260, Math.min(540, resizeStartW.current + ev.clientX - resizeStartX.current)));
        };
        const onUp = () => {
            isResizing.current = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        e.preventDefault();
    };

    // ── Hover tooltip ─────────────────────────────────────────────────────────
    type HoverInfo = { name: string; subtitle?: string; description?: string; trackCount?: number; accent?: string; y: number };
    const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
    const hoverHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const showHover = (e: React.MouseEvent<Element>, info: Omit<HoverInfo, 'y'>) => {
        if (hoverHideTimer.current) clearTimeout(hoverHideTimer.current);
        const rect = e.currentTarget.getBoundingClientRect();
        setHoverInfo({ ...info, y: rect.top + rect.height / 2 });
    };
    const hideHover = () => {
        hoverHideTimer.current = setTimeout(() => setHoverInfo(null), 80);
    };

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        setUserChannels(loadUserChannels());
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const media = window.matchMedia('(max-width: 1023px)');
        const updateViewport = () => setIsMobileViewport(media.matches);
        updateViewport();
        media.addEventListener('change', updateViewport);
        return () => media.removeEventListener('change', updateViewport);
    }, []);

    const refreshPlaylists = useCallback(async () => {
        setPlaylistsLoading(true);
        setPlaylistError('');
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
            setPlaylists(normalizedLists);
        } catch (error) {
            setPlaylistError((error as Error).message || 'Failed to load playlists');
            setPlaylists([]);
        } finally {
            setPlaylistsLoading(false);
        }
    }, []);

    useEffect(() => {
        if ((isOpen || desktopPinned) && user) {
            void refreshPlaylists();
        }
    }, [desktopPinned, isOpen, user, refreshPlaylists]);

    // Load public community channels on mount (for Hot Channels + All Channels modal)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        void getPublicMusicChannels(user?.uid).then(pub => {
            if (pub.length > 0) {
                setPublicChannels(pub);
                // The public channels already carry totalLikes from the backend.
                // Also load stats for all system channel slugs so Hot Channels can rank them.
                const systemSlugs = ['background-music', 'nhacviet-tiktok', 'rap-tiktok', 'nhac-soi-dong', 'nhac-en-chill'];
                void getChannelStats(systemSlugs, user?.uid).then(stats => {
                    setChannelStats(prev => ({ ...prev, ...stats }));
                });
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleUpdated = () => { void refreshPlaylists(); };
        window.addEventListener(MUSIC_PLAYLISTS_UPDATED_EVENT, handleUpdated);
        return () => window.removeEventListener(MUSIC_PLAYLISTS_UPDATED_EVENT, handleUpdated);
    }, [refreshPlaylists]);

    // Load Music Shorts when Shorts tab is active, then immediately load all into main player
    useEffect(() => {
        if (!shortsOpen) return;
        setShortsLoading(true);
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://ai.wordai.pro';
        fetch(`${API_BASE}/api/v1/trending/music?lang=${shortsLang}&limit=40&offset=0`)
            .then(r => r.json())
            .then(d => {
                const items: Array<{ youtube_id: string; title: string; channel: string; thumbnail: string; duration_sec: number }> = d.items ?? [];
                setShortsItems(items);
                // Auto-load all shorts into the main snap-scroll player
                if (items.length > 0) {
                    const tracks: SidebarTrack[] = items.map(item => ({
                        id: `yt_${item.youtube_id}`,
                        title: item.title,
                        artist: item.channel,
                        audioUrl: `yt:${item.youtube_id}`,
                        durationSec: item.duration_sec,
                        source: 'youtube' as const,
                        thumbnailUrl: item.thumbnail,
                        youtubeId: item.youtube_id,
                    }));
                    onPlayTracks(tracks, 0);
                }
            })
            .catch(() => setShortsItems([]))
            .finally(() => setShortsLoading(false));
    }, [shortsOpen, shortsLang]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load local playlists from localStorage on mount and migrate multiple into one
    useEffect(() => {
        if (typeof window === 'undefined') return;
        import('@/lib/localLibrary').then(({ getLocalPlaylists, saveLocalPlaylists }) => {
            const current = getLocalPlaylists();
            if (current.length === 0) {
                setLocalPlaylists([]);
                return;
            }
            // Migrate: merge all into one master library
            const masterId = 'local_library';
            const masterPl: LocalPlaylist = {
                id: masterId,
                name: isVietnamese ? 'Nhạc trên máy' : 'Local Library',
                tracks: [],
                createdAt: Date.now()
            };
            const trackMap = new Map<string, LocalPlaylist['tracks'][0]>();
            current.forEach(pl => {
                pl.tracks.forEach(t => {
                    // Try to deduplicate by id
                    if (!trackMap.has(t.id)) {
                        trackMap.set(t.id, t);
                    }
                });
            });
            masterPl.tracks = Array.from(trackMap.values());

            const updated = [masterPl];
            saveLocalPlaylists(updated);
            setLocalPlaylists(updated);
            setExpandedLocalPlaylist(masterId); // Always expanded
        });
    }, [isVietnamese]);

    const handleAddLocalFiles = async () => {
        if (localProcessing) return;
        setLocalProcessing(true);
        setLocalError('');
        try {
            const { pickAudioFiles, getLocalPlaylists, saveLocalPlaylists } = await import('@/lib/localLibrary');
            const tracks = await pickAudioFiles();
            if (!tracks.length) { setLocalProcessing(false); return; }

            const current = getLocalPlaylists();
            const masterId = 'local_library';
            const masterPl = current.find(p => p.id === masterId) || {
                id: masterId,
                name: isVietnamese ? 'Nhạc trên máy' : 'Local Library',
                tracks: [],
                createdAt: Date.now()
            };

            // Prepend new tracks to the master library
            masterPl.tracks = [...tracks, ...masterPl.tracks];

            const updated = [masterPl, ...current.filter(p => p.id !== masterId)];
            saveLocalPlaylists(updated);
            setLocalPlaylists(updated);
            setExpandedLocalPlaylist(masterId);
        } catch (e) {
            setLocalError((e as Error).message || 'Failed to open files');
        } finally {
            setLocalProcessing(false);
        }
    };

    const handleAddLocalFolder = async () => {
        if (localProcessing) return;
        setLocalProcessing(true);
        setLocalError('');
        try {
            const { pickAudioFolder, getLocalPlaylists, saveLocalPlaylists } = await import('@/lib/localLibrary');
            const result = await pickAudioFolder();
            if (!result || !result.tracks.length) { setLocalProcessing(false); return; }

            const current = getLocalPlaylists();
            const masterId = 'local_library';
            const masterPl = current.find(p => p.id === masterId) || {
                id: masterId,
                name: isVietnamese ? 'Nhạc trên máy' : 'Local Library',
                tracks: [],
                createdAt: Date.now()
            };

            // Prepend new tracks to master library
            masterPl.tracks = [...result.tracks, ...masterPl.tracks];

            const updated = [masterPl, ...current.filter(p => p.id !== masterId)];
            saveLocalPlaylists(updated);
            setLocalPlaylists(updated);
            setExpandedLocalPlaylist(masterId);
        } catch (e) {
            setLocalError((e as Error).message || 'Failed to open folder');
        } finally {
            setLocalProcessing(false);
        }
    };

    const handleDeleteLocalPlaylist = (id: string) => {
        import('@/lib/localLibrary').then(({ deleteLocalPlaylist, getLocalPlaylists }) => {
            deleteLocalPlaylist(id);
            setLocalPlaylists(getLocalPlaylists());
        });
    };

    // ── Local audio cache helper ──────────────────────────────────────────────
    // After import, save the MP3 blob to IndexedDB so the player can play it
    // locally without fetching from R2 on subsequent plays.
    const backgroundCacheTrack = useCallback((trackId: string, audioUrl: string) => {
        if (!audioUrl || audioUrl.startsWith('local:')) return;
        void (async () => {
            try {
                const res = await fetch(audioUrl);
                if (res.ok) {
                    const blob = await res.blob();
                    await cacheAudioBlob(trackId, blob);
                }
            } catch { /* ignore — player will fall back to R2 URL */ }
        })();
    }, []);

    // ── YouTube search ────────────────────────────────────────────────────────

    const handleYtSearch = useCallback(async () => {
        if (!ytQuery.trim()) return;
        setYtLoading(true);
        setYtError('');
        setYtResults([]);
        try {
            const results = await searchYouTube(ytQuery.trim());
            setYtResults(results);
        } catch (e) {
            setYtError((e as Error).message || 'Search failed');
        } finally {
            setYtLoading(false);
        }
    }, [ytQuery]);

    const handleImportAndPlay = useCallback((result: YTSearchResult) => {
        // Play directly via YouTube embed — no MP3 download needed, instant.
        const track: SidebarTrack = {
            id: `yt_${result.youtube_id}`,
            title: result.title,
            artist: result.artist,
            audioUrl: `yt:${result.youtube_id}`,
            durationSec: result.duration_sec,
            source: 'youtube',
            thumbnailUrl: result.thumbnail,
            youtubeId: result.youtube_id,
        };
        onPlayTracks([track], 0);
        onClose();
    }, [onPlayTracks, onClose]);

    const handleImportAndAddToPlaylist = useCallback((result: YTSearchResult) => {
        const track: PlaylistTrack = {
            id: `yt_${result.youtube_id}`,
            title: result.title,
            artist: result.artist,
            audioUrl: `yt:${result.youtube_id}`,
            durationSec: result.duration_sec,
            source: 'youtube',
            thumbnailUrl: result.thumbnail,
            youtubeId: result.youtube_id,
        };
        setAddingTrack(track);
        setPickerOpen(true);
    }, []);

    // ── URL-to-playlist (instant, no server) ─────────────────────────────────

    const handleAddUrlToPlaylist = useCallback((mode: 'play' | 'add') => {
        const url = urlLinkInput.trim();
        setUrlLinkError('');
        if (!url) return;

        // YouTube: extract video ID from various URL formats
        const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
        if (ytMatch) {
            const ytId = ytMatch[1];
            const track: PlaylistTrack = {
                id: `yt_${ytId}`,
                title: `YouTube – ${ytId}`,
                artist: 'YouTube',
                audioUrl: `yt:${ytId}`,
                durationSec: 0,
                source: 'youtube',
                youtubeId: ytId,
            };
            if (mode === 'play') {
                onPlayTracks([{ ...track, source: 'youtube' }], 0);
                onClose();
            } else {
                setAddingTrack(track);
                setPickerOpen(true);
            }
            setUrlLinkInput('');
            return;
        }

        // Facebook: extract reel / video ID — distinguish portrait reels from landscape videos
        const fbMatch = url.match(/facebook\.com\/(?:(reel)\/|watch\/?\?v=|video\.php\?v=)(\d+)/);
        if (fbMatch) {
            const isReel = !!fbMatch[1]; // fbMatch[1] = 'reel' for reel URLs, undefined for watch
            const fbId = fbMatch[2];
            const track: PlaylistTrack = {
                id: `fb_${fbId}`,
                title: isReel ? `Facebook Reel – ${fbId}` : `Facebook Video – ${fbId}`,
                artist: 'Facebook',
                audioUrl: isReel ? `fbreel:${fbId}` : `fb:${fbId}`,
                durationSec: 0,
                source: 'facebook',
                facebookId: fbId,
                facebookIsReel: isReel ? true : undefined,
            };
            if (mode === 'play') {
                onPlayTracks([{ ...track }], 0);
                onClose();
            } else {
                setAddingTrack(track);
                setPickerOpen(true);
            }
            setUrlLinkInput('');
            return;
        }

        setUrlLinkError(isVietnamese ? 'URL không hợp lệ. Chỉ hỗ trợ YouTube và Facebook Reel.' : 'Invalid URL. Only YouTube and Facebook Reel links are supported.');
    }, [urlLinkInput, isVietnamese, onPlayTracks, onClose]);

    const handleImportUrl = useCallback(async () => {
        const url = importUrl.trim();
        if (!url) return;
        setImporting(true);
        setImportError('');
        setImportedTrack(null);
        setImportedTrackAdded(false);
        try {
            const isYt = url.includes('youtube.com') || url.includes('youtu.be');
            const isTt = url.includes('tiktok.com');
            if (!isYt && !isTt) throw new Error('Only YouTube and TikTok URLs are supported');
            const meta = isYt ? await importYouTube(url) : await importTikTok(url);
            backgroundCacheTrack(meta.track_id, meta.audio_url);
            setImportedTrack(trackMetaToPlaylist(meta));
        } catch (e) {
            setImportError((e as Error).message);
        } finally {
            setImporting(false);
        }
    }, [importUrl]);

    // ── Playlists ─────────────────────────────────────────────────────────────

    const handleCreatePlaylist = async () => {
        const name = newPlaylistName.trim();
        if (!name) return;
        try {
            setPlaylistError('');
            const created = await createMusicPlaylist(name);
            setPlaylists((prev) => [created, ...prev]);
            setExpandedPlaylist(created.id);
            setNewPlaylistName('');
            setCreatingPlaylist(false);
        } catch (error) {
            setPlaylistError((error as Error).message || 'Failed to create playlist');
        }
    };

    // ── Publish / unpublish playlist as channel ───────────────────────────────
    const handleTogglePublish = (pl: Playlist) => {
        if (!user) return;
        if (publishedIds.has(pl.id)) {
            // Already published — open modal to update or unpublish
            const existing = publicChannels.find(c => c.id === pl.id);
            setPublishMeta({
                name: existing?.name ?? pl.name,
                accent: existing?.accent ?? '#4f46e5',
                description: existing?.description ?? '',
                genre: existing?.genre ?? 'mixed',
                mood: existing?.mood ?? '',
                tags: existing?.tags ?? '',
            });
        } else {
            // Not published — open modal to fill metadata
            setPublishMeta({ name: pl.name, accent: '#4f46e5', description: '', genre: 'mixed', mood: '', tags: '' });
        }
        setPublishModalPlaylist(pl);
        setPublishModalOpen(true);
    };

    const handlePublishSubmit = async () => {
        if (!publishModalPlaylist || !user) return;
        const pl = publishModalPlaylist;
        const isPublished = publishedIds.has(pl.id);
        setPublishingId(pl.id);
        setPublishModalOpen(false);
        try {
            // ── Upload local files to R2 before publishing ──────────────────
            // Tracks with asset:// URLs can only be played on this device.
            // Upload them to R2 so other devices can stream them.
            const localTracks = playlists
                .find(p => p.id === pl.id)?.tracks
                .filter(t => t.audioUrl?.startsWith('asset://')) ?? [];

            if (localTracks.length > 0) {
                for (const t of localTracks) {
                    try {
                        const fileName = t.audioUrl.split('/').pop() || `${t.id}.mp3`;
                        const r2Url = await uploadLocalAudioToR2(t.audioUrl, fileName, {
                            title: t.title,
                            artist: t.artist,
                            durationSec: t.durationSec,
                            coverUrl: t.thumbnailUrl,
                            sourceTrackId: t.id,
                        });
                        setPlaylists(prev => prev.map(p => p.id === pl.id
                            ? { ...p, tracks: p.tracks.map(tr => tr.id === t.id ? { ...tr, audioUrl: r2Url } : tr) }
                            : p));
                    } catch {
                        // Skip track if upload fails — publish continues with other tracks
                    }
                }
            }

            if (isPublished) {
                await updateChannelMetadata(pl.id, publishMeta);
                setPublicChannels(prev => prev.map(c => c.id === pl.id
                    ? { ...c, name: publishMeta.name || c.name, accent: publishMeta.accent || c.accent, description: publishMeta.description ?? c.description, genre: publishMeta.genre ?? c.genre, mood: publishMeta.mood ?? c.mood, tags: publishMeta.tags ?? c.tags }
                    : c));
            } else {
                await publishPlaylistAsChannel(pl.id, publishMeta);
                setPublishedIds(prev => new Set(prev).add(pl.id));
                const uid = user.uid;
                const pub = await getPublicMusicChannels(uid);
                setPublicChannels(pub);
                setChannelStats(prev => ({ [pl.id]: { totalLikes: 0, hasLiked: false }, ...prev }));
            }
        } catch (err) {
            setPlaylistError((err as Error).message || 'Failed to publish channel');
        } finally {
            setPublishingId(null);
        }
    };

    const handleUnpublish = async (pl: Playlist) => {
        if (!user) return;
        setPublishingId(pl.id);
        setPublishModalOpen(false);
        try {
            await unpublishChannel(pl.id);
            setPublishedIds(prev => { const s = new Set(prev); s.delete(pl.id); return s; });
            setPublicChannels(prev => prev.filter(c => c.id !== pl.id));
        } catch (err) {
            setPlaylistError((err as Error).message || 'Failed to unpublish');
        } finally {
            setPublishingId(null);
        }
    };

    // ── Rename track ──────────────────────────────────────────────────────────
    const handleRenameTrackSave = async () => {
        if (!renamingTrack || !renamingTrack.value.trim()) { setRenamingTrack(null); return; }
        const { playlistId, trackId, value } = renamingTrack;
        const newTitle = value.trim();
        setRenamingTrack(null);
        try {
            await renamePlaylistTrack(playlistId, trackId, newTitle);
            setPlaylists(prev => prev.map(pl => pl.id === playlistId
                ? { ...pl, tracks: pl.tracks.map(t => t.id === trackId ? { ...t, title: newTitle } : t) }
                : pl));
        } catch (err) {
            setPlaylistError((err as Error).message || 'Failed to rename track');
        }
    };

    // ── Like / unlike a channel ───────────────────────────────────────────────
    const handleChannelLike = async (channelId: string) => {
        if (!user) return;
        const current = channelStats[channelId] ?? { totalLikes: 0, hasLiked: false };
        // Optimistic update
        setChannelStats(prev => ({
            ...prev,
            [channelId]: { totalLikes: current.hasLiked ? Math.max(0, current.totalLikes - 1) : current.totalLikes + 1, hasLiked: !current.hasLiked },
        }));
        // Also update publicChannels list
        setPublicChannels(prev => prev.map(c => c.id === channelId
            ? { ...c, totalLikes: current.hasLiked ? Math.max(0, c.totalLikes - 1) : c.totalLikes + 1, hasLiked: !current.hasLiked }
            : c));
        setLikingChannelId(channelId);
        try {
            const result = await toggleChannelLike(channelId, current.hasLiked);
            setChannelStats(prev => ({ ...prev, [channelId]: { totalLikes: result.totalLikes, hasLiked: result.hasLiked } }));
            setPublicChannels(prev => prev.map(c => c.id === channelId ? { ...c, totalLikes: result.totalLikes, hasLiked: result.hasLiked } : c));
        } catch {
            // Revert optimistic update
            setChannelStats(prev => ({ ...prev, [channelId]: current }));
            setPublicChannels(prev => prev.map(c => c.id === channelId ? { ...c, totalLikes: current.totalLikes, hasLiked: current.hasLiked } : c));
        } finally {
            setLikingChannelId(null);
        }
    };

    const handleDeletePlaylist = async (id: string) => {
        try {
            setPlaylistError('');
            setConfirmDeleteId(null);
            await deleteMusicPlaylist(id);
            setPlaylists((prev) => prev.filter((playlist) => playlist.id !== id));
            if (expandedPlaylist === id) setExpandedPlaylist(null);
        } catch (error) {
            setPlaylistError((error as Error).message || 'Failed to delete playlist');
        }
    };

    const handleRemoveTrackFromPlaylist = async (playlistId: string, trackId: string) => {
        try {
            setPlaylistError('');
            await removeTrackFromMusicPlaylist(playlistId, trackId);
            setPlaylists((prev) => prev.map((playlist) => (
                playlist.id === playlistId
                    ? { ...playlist, tracks: playlist.tracks.filter((track) => track.id !== trackId) }
                    : playlist
            )));
        } catch (error) {
            setPlaylistError((error as Error).message || 'Failed to remove track');
        }
    };

    const handleAddTrackToPlaylist = async (playlistId: string) => {
        if (!addingTrack) return;
        try {
            setPlaylistError('');
            await addTrackToMusicPlaylist(playlistId, addingTrack);
            setPlaylists((prev) => prev.map((playlist) => {
                if (playlist.id !== playlistId) return playlist;
                if (playlist.tracks.some((track) => track.id === addingTrack.id)) return playlist;
                return { ...playlist, tracks: [{ ...addingTrack }, ...playlist.tracks] };
            }));
            if (pendingYtId.current) {
                setAddedYtIds(prev => new Set(prev).add(pendingYtId.current!));
                pendingYtId.current = null;
            } else {
                setImportedTrackAdded(true);
            }
            setAddingTrack(null);
            setPickerOpen(false);
        } catch (error) {
            setPlaylistError((error as Error).message || 'Failed to add track');
        }
    };

    const handleConfirmUpload = async () => {
        if (!uploadFiles.length || uploadProcessing) return;
        setUploadProcessing(true);
        setPlaylistError('');
        setUploadProgress(0);
        try {
            // Get or create target playlist
            let targetId = uploadTargetId;
            if (!targetId) {
                const name = uploadNewName.trim() || `My Playlist ${new Date().toLocaleDateString()}`;
                const created = await createMusicPlaylist(name);
                setPlaylists(prev => [created, ...prev]);
                setExpandedPlaylist(created.id);
                targetId = created.id;
            }
            const newTracks: MusicPlaylist['tracks'] = [];
            for (let i = 0; i < uploadFiles.length; i++) {
                const file = uploadFiles[i];
                const trackId = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
                const duration = await extractFileDuration(file);
                const rawName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

                // Save blob to IndexedDB on this device — zero network cost, zero server storage
                await cacheAudioBlob(trackId, file);
                // Also keep in session cache for instant first play
                setSessionBlob(trackId, file);

                const track: PlaylistTrack = {
                    id: trackId,
                    title: rawName,
                    artist: '',
                    audioUrl: `local:${trackId}`,
                    durationSec: duration,
                    source: 'local',
                };
                await addTrackToMusicPlaylist(targetId, track, /* silent */ true);
                newTracks.push(track);
                setUploadProgress(Math.round(((i + 1) / uploadFiles.length) * 100));
            }
            // Emit once after all tracks saved — triggers a single authoritative
            // re-fetch instead of one partial re-fetch per track (which caused duplicates)
            await refreshPlaylists();
            setUploadFiles([]);
            setUploadTargetId('');
            setUploadNewName('');
            setExpandedPlaylist(targetId);
        } catch (error) {
            setPlaylistError((error as Error).message || 'Upload failed');
        } finally {
            setUploadProcessing(false);
            setUploadProgress(0);
        }
    };

    const handleUploadCancel = () => {
        setUploadFiles([]);
        setUploadTargetId('');
        setUploadNewName('');
    };

    if (!mounted) return null;
    if (!desktopPinned && !isOpen) return null;

    const effectiveDark = isMobileViewport ? true : isDark;
    const border = effectiveDark ? 'border-white/10' : 'border-slate-200/80';
    const textPrimary = effectiveDark ? 'text-white' : 'text-slate-900';
    const textSec = effectiveDark ? 'text-slate-300/70' : 'text-slate-500';
    const textMuted = effectiveDark ? 'text-slate-400/60' : 'text-slate-400';
    const inputCls = effectiveDark
        ? 'bg-[#1e2a45] border-white/10 text-white placeholder:text-slate-400/55 [color-scheme:dark]'
        : 'bg-white border-slate-200/90 text-slate-900 placeholder:text-slate-400 [color-scheme:light]';
    const hoverCls = effectiveDark ? 'hover:bg-white/[0.07]' : 'hover:bg-slate-100/80';
    const secondarySurface = effectiveDark ? 'bg-white/[0.055]' : 'bg-white/75';
    const elevatedSurface = effectiveDark ? 'bg-[#0f172a]/80' : 'bg-white/88';
    const accentPrimary = '#4f46e5';
    const accentStrong = '#312e81';
    const panelStyle = effectiveDark
        ? {
            background: 'radial-gradient(circle at top left, rgba(79,70,229,0.22), transparent 34%), radial-gradient(circle at bottom right, rgba(59,130,246,0.16), transparent 32%), linear-gradient(180deg, rgba(8,15,35,0.98) 0%, rgba(10,18,39,0.98) 100%)',
        }
        : {
            background: 'radial-gradient(circle at top left, rgba(79,70,229,0.14), transparent 34%), radial-gradient(circle at bottom right, rgba(59,130,246,0.1), transparent 36%), linear-gradient(180deg, rgba(245,247,255,0.97) 0%, rgba(255,255,255,0.94) 100%)',
        };

    // ── Tab renderer ──────────────────────────────────────────────────────────

    // ── Create channel handler ────────────────────────────────────────────────

    const handleCreateChannel = () => {
        const name = createChName.trim();
        if (!name) return;
        const id = `user_ch_${Date.now().toString(36)}`;
        const label = createChLabel.trim() || name.toLowerCase().replace(/\s+/g, '-');
        const newCh: UserChannel = { id, name, label, accent: createChAccent, createdAt: Date.now() };
        const updated = [newCh, ...userChannels];
        setUserChannels(updated);
        saveUserChannels(updated);
        setCreateChName('');
        setCreateChLabel('');
        setCreateChAccent(ACCENT_OPTIONS[0]);
        setCreateChOpen(false);
    };

    const handleDeleteUserChannel = (id: string) => {
        const updated = userChannels.filter(c => c.id !== id);
        setUserChannels(updated);
        saveUserChannels(updated);
    };

    // ── Channel row renderer ──────────────────────────────────────────────────

    const renderChannelRow = (ch: SidebarChannel | UserChannel, isUser = false) => {
        const slug = (ch as SidebarChannel).slug ?? (ch as UserChannel).id;
        const isSelected = slug === selectedChannelSlug;
        const isExpanded = expandedChannel === slug;
        return (
            <div key={slug}>
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                        onSelectChannel(slug);
                        setExpandedChannel(isExpanded ? null : slug);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectChannel(slug); setExpandedChannel(isExpanded ? null : slug); } }}
                    onMouseEnter={e => showHover(e as React.MouseEvent, { name: ch.name, subtitle: ch.label, accent: ch.accent })}
                    onMouseLeave={hideHover}
                    className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all cursor-pointer ${hoverCls} ${isSelected ? (effectiveDark ? 'bg-white/[0.08] shadow-[0_12px_30px_rgba(15,23,42,0.25)]' : 'bg-white shadow-[0_12px_28px_rgba(79,70,229,0.08)]') : ''}`}
                >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: `${ch.accent}20`, border: `1.5px solid ${ch.accent}40` }}>
                        {isUser
                            ? <Radio className="w-3.5 h-3.5" style={{ color: ch.accent }} />
                            : <AudioWaveform className="w-3.5 h-3.5" style={{ color: ch.accent }} />
                        }
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${textPrimary}`}>{ch.name}</p>
                        <p className={`text-[11px] truncate ${textSec}`}>{ch.label}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {isUser && (
                            <button
                                onClick={e => { e.stopPropagation(); handleDeleteUserChannel((ch as UserChannel).id); }}
                                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${effectiveDark ? 'text-slate-500 hover:text-rose-400 hover:bg-white/10' : 'text-slate-400 hover:text-rose-500 hover:bg-slate-100'}`}
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                        {/* Like button for system channels */}
                        {!isUser && (() => {
                            const stat = channelStats[slug] ?? { totalLikes: 0, hasLiked: false };
                            return (
                                <button
                                    onClick={e => { e.stopPropagation(); void handleChannelLike(slug); }}
                                    disabled={!user || likingChannelId === slug}
                                    title={stat.hasLiked ? (isVietnamese ? 'Bỏ thích' : 'Unlike') : (isVietnamese ? 'Thích kênh' : 'Like')}
                                    className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] font-semibold transition-colors ${stat.hasLiked
                                        ? 'text-rose-400 bg-rose-500/15 hover:bg-rose-500/25'
                                        : (effectiveDark ? 'text-slate-400/60 hover:text-rose-300 hover:bg-white/[0.06]' : 'text-slate-400 hover:text-rose-500 hover:bg-slate-100')
                                        } disabled:opacity-40`}
                                >
                                    <Heart className={`w-3 h-3 ${stat.hasLiked ? 'fill-current' : ''}`} />
                                    {stat.totalLikes > 0 && <span>{stat.totalLikes}</span>}
                                </button>
                            );
                        })()}
                        {isSelected && (
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ch.accent, boxShadow: `0 0 0 4px ${ch.accent}16` }} />
                        )}
                        {!isSelected && (channelTotalPlays[slug] ?? 0) > 0 && (
                            <span className={`text-[10px] tabular-nums font-medium ${effectiveDark ? 'text-slate-500' : 'text-slate-400'}`}
                                title={isVietnamese ? 'Tổng lượt nghe' : 'Total plays'}>
                                {channelTotalPlays[slug] >= 1000
                                    ? `${(channelTotalPlays[slug] / 1000).toFixed(1)}k`
                                    : channelTotalPlays[slug]}▶
                            </span>
                        )}
                        {isExpanded
                            ? <ChevronDown className={`w-4 h-4 ${textSec}`} />
                            : <ChevronRight className={`w-4 h-4 ${textSec}`} />
                        }
                    </div>
                </div>
                {isExpanded && !isUser && (
                    <div className={`border-l-2 ml-4 ${effectiveDark ? 'border-white/10' : 'border-slate-200/90'}`}
                        style={{ borderLeftColor: ch.accent + '50' }}>
                        <ChannelTrackList
                            slug={slug}
                            onLoadTracks={onLoadChannelTracks}
                            onPlayTracks={onPlayTracks}
                            accent={ch.accent}
                            isDark={isDark}
                            currentTrackId={currentTrackId}
                            onTotalPlays={handleChannelTotalPlays}
                        />
                    </div>
                )}
                {isExpanded && isUser && (
                    <div className="ml-4 py-3 px-3">
                        <p className={`text-xs ${textMuted}`}>{isVietnamese ? 'Kênh chưa có bài hát. Thêm từ playlist của bạn.' : 'No tracks yet. Add tracks from your playlists.'}</p>
                    </div>
                )}
            </div>
        );
    };

    // ── Shorts tab renderer ───────────────────────────────────────────────────

    const renderShortsTab = () => (
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* Lang toggle */}
            <div className="px-4 py-3 border-b flex-shrink-0 flex items-center justify-between"
                style={{ borderColor: effectiveDark ? 'rgba(255,255,255,0.1)' : 'rgba(203,213,225,0.8)' }}>
                <span className={`text-sm font-medium ${textPrimary}`}>
                    {isVietnamese ? 'Music Trending' : 'Music Trending'}
                </span>
                <div className="flex gap-1">
                    {(['vi', 'en'] as const).map(l => (
                        <button
                            key={l}
                            onClick={() => setShortsLang(l)}
                            className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-colors ${shortsLang === l
                                ? 'text-white'
                                : (effectiveDark ? 'text-slate-400 hover:text-white hover:bg-white/[0.06]' : 'text-slate-500 hover:bg-slate-100')
                                }`}
                            style={shortsLang === l ? { background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)' } : undefined}
                        >
                            {l.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            <div className={`flex-1 overflow-y-auto px-2 py-2 [scrollbar-width:auto] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full ${effectiveDark ? '[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/12' : '[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300/80'}`}>
                {shortsLoading && (
                    <div className="flex justify-center py-12">
                        <Loader2 className={`w-6 h-6 animate-spin ${effectiveDark ? 'text-white/40' : 'text-slate-400'}`} />
                    </div>
                )}
                {!shortsLoading && shortsItems.length === 0 && (
                    <div className="py-12 text-center px-4">
                        <PlayCircle className={`w-10 h-10 mx-auto mb-3 ${textMuted}`} />
                        <p className={`text-sm ${textSec}`}>
                            {isVietnamese ? 'Không tải được danh sách.' : 'Could not load shorts.'}
                        </p>
                    </div>
                )}
                {!shortsLoading && shortsItems.map((item, idx) => (
                    <button
                        key={item.youtube_id}
                        onClick={() => {
                            // Load ALL shorts starting from clicked index so auto-advance works
                            const allTracks: SidebarTrack[] = shortsItems.map(i => ({
                                id: `yt_${i.youtube_id}`,
                                title: i.title,
                                artist: i.channel,
                                audioUrl: `yt:${i.youtube_id}`,
                                durationSec: i.duration_sec,
                                source: 'youtube' as const,
                                thumbnailUrl: i.thumbnail,
                                youtubeId: i.youtube_id,
                            }));
                            onPlayTracks(allTracks, idx);
                        }}
                        className={`w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all ${hoverCls}`}
                    >
                        <div className="relative w-14 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-gray-800">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                <Play className="w-3.5 h-3.5 text-white" fill="currentColor" />
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium line-clamp-2 leading-tight ${textPrimary}`}>{item.title}</p>
                            <p className={`text-[10px] mt-0.5 truncate ${textSec}`}>{item.channel}</p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );

    const renderChannelsTab = () => {
        const nowPlayingChannel: { name: string; accent: string } | null =
            selectedChannelSlug && selectedChannelSlug !== 'playlist'
                ? (
                    channels.find(c => c.slug === selectedChannelSlug) ??
                    userChannels.find(c => c.id === selectedChannelSlug) ??
                    publicChannels.find(c => c.id === selectedChannelSlug) ??
                    null
                )
                : null;
        // Hot Channels: all src combined, sorted by live likes, top 5
        const allSrcChannels: (SidebarChannel & { totalLikes: number })[] = [
            ...channels.map(ch => ({ ...ch, totalLikes: channelStats[ch.slug]?.totalLikes ?? 0 })),
            ...publicChannels.map(pub => ({
                slug: pub.id,
                name: pub.name,
                label: pub.description || 'community channel',
                accent: pub.accent,
                // prefer live channelStats if available (updated after likes), fallback to pub.totalLikes
                totalLikes: channelStats[pub.id]?.totalLikes ?? pub.totalLikes,
            })),
        ];
        // Dedup by slug (community channels already in system list are skipped)
        const seen = new Set<string>();
        const dedupedChannels = allSrcChannels.filter(c => { if (seen.has(c.slug)) return false; seen.add(c.slug); return true; });
        const hotChannels = dedupedChannels.sort((a, b) => b.totalLikes - a.totalLikes).slice(0, 5);
        const newSystemChannels = channels.slice(5);
        return (
            <div className="flex flex-col flex-1 overflow-hidden">
                {/* Channel list */}
                <div className={`flex-1 overflow-y-auto px-2 py-2 [scrollbar-width:auto] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full ${effectiveDark ? '[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/12' : '[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300/80'}`}>

                    {/* Currently Playing pin */}
                    {nowPlayingChannel && (
                        <div className="mb-3 px-2">
                            <div
                                className="flex items-center gap-2 rounded-2xl px-3 py-2.5"
                                style={{ background: `${nowPlayingChannel.accent}18`, border: `1px solid ${nowPlayingChannel.accent}30` }}
                            >
                                <div className="w-1.5 h-4 rounded-full animate-pulse flex-shrink-0" style={{ background: nowPlayingChannel.accent }} />
                                <div className="flex-1 min-w-0">
                                    <p className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${effectiveDark ? 'text-white/50' : 'text-slate-400'}`}>
                                        {isVietnamese ? 'Đang phát' : 'Now Playing'}
                                    </p>
                                    <p className="text-xs font-semibold truncate" style={{ color: nowPlayingChannel.accent }}>
                                        {nowPlayingChannel.name}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Hot Channels section */}
                    <div className="mb-1 px-2">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                                <Flame className="w-3.5 h-3.5 text-orange-400" />
                                <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${effectiveDark ? 'text-white/60' : 'text-slate-500'}`}>
                                    {isVietnamese ? 'Kênh Nổi Bật' : 'Hot Channels'}
                                </p>
                            </div>
                            <button
                                onClick={() => { setViewAllOpen(true); setViewAllSearch(''); }}
                                className={`text-[10px] font-semibold transition-colors ${effectiveDark ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-700'}`}
                            >
                                {isVietnamese ? 'Xem tất cả' : 'View All'}
                            </button>
                        </div>
                        {hotChannels.map(ch => renderChannelRow(ch, false))}
                    </div>

                    {/* Community Channels section (published playlists) */}
                    {publicChannels.length > 0 && (
                        <div className="mt-4 mb-1 px-2">
                            <div className="flex items-center gap-1.5 mb-2">
                                <Globe className="w-3.5 h-3.5 text-indigo-400" />
                                <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${effectiveDark ? 'text-white/60' : 'text-slate-500'}`}>
                                    {isVietnamese ? 'Kênh Cộng Đồng' : 'Community Channels'}
                                </p>
                            </div>
                            {publicChannels.map(pub => {
                                const isSelected = pub.id === selectedChannelSlug;
                                const stat = channelStats[pub.id] ?? { totalLikes: pub.totalLikes, hasLiked: pub.hasLiked };
                                const isExpanded = expandedChannel === pub.id;
                                return (
                                    <div key={pub.id}>
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => { onSelectChannel(pub.id); setExpandedChannel(isExpanded ? null : pub.id); }}
                                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectChannel(pub.id); setExpandedChannel(isExpanded ? null : pub.id); } }}
                                            onMouseEnter={e => showHover(e as React.MouseEvent, { name: pub.name, subtitle: pub.description || (isVietnamese ? 'kênh cộng đồng' : 'community channel'), description: stat.totalLikes > 0 ? `${stat.totalLikes} ♥ likes` : undefined, accent: pub.accent })}
                                            onMouseLeave={hideHover}
                                            className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all cursor-pointer ${hoverCls} ${isSelected ? (effectiveDark ? 'bg-white/[0.08]' : 'bg-white shadow-[0_12px_28px_rgba(79,70,229,0.08)]') : ''}`}
                                        >
                                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                                style={{ background: `${pub.accent}20`, border: `1.5px solid ${pub.accent}40` }}>
                                                <Radio className="w-3.5 h-3.5" style={{ color: pub.accent }} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-medium truncate ${textPrimary}`}>{pub.name}</p>
                                                <p className={`text-[11px] truncate ${textSec}`}>
                                                    {stat.totalLikes > 0 ? `${stat.totalLikes} ♥` : (isVietnamese ? 'kênh cộng đồng' : 'community channel')}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {/* Like button */}
                                                <button
                                                    onClick={e => { e.stopPropagation(); void handleChannelLike(pub.id); }}
                                                    disabled={!user || likingChannelId === pub.id}
                                                    title={stat.hasLiked ? (isVietnamese ? 'Bỏ thích' : 'Unlike') : (isVietnamese ? 'Thích kênh' : 'Like channel')}
                                                    className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] font-semibold transition-colors ${stat.hasLiked
                                                        ? 'text-rose-400 bg-rose-500/15 hover:bg-rose-500/25'
                                                        : (effectiveDark ? 'text-slate-400/70 hover:text-rose-300 hover:bg-white/[0.08]' : 'text-slate-400 hover:text-rose-500 hover:bg-slate-100')
                                                        } disabled:opacity-50`}
                                                >
                                                    <Heart className={`w-3 h-3 ${stat.hasLiked ? 'fill-current' : ''}`} />
                                                    {stat.totalLikes > 0 && <span>{stat.totalLikes}</span>}
                                                </button>
                                                {isSelected && (
                                                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: pub.accent, boxShadow: `0 0 0 4px ${pub.accent}16` }} />
                                                )}
                                                {isExpanded
                                                    ? <ChevronDown className={`w-4 h-4 ${textSec}`} />
                                                    : <ChevronRight className={`w-4 h-4 ${textSec}`} />
                                                }
                                            </div>
                                        </div>
                                        {isExpanded && (
                                            <div className={`border-l-2 ml-4`} style={{ borderLeftColor: pub.accent + '50' }}>
                                                <ChannelTrackList
                                                    slug={pub.id}
                                                    onLoadTracks={onLoadChannelTracks}
                                                    onPlayTracks={(tracks, startIdx) => onPlayTracks(tracks, startIdx, pub.id, pub.name)}
                                                    accent={pub.accent}
                                                    isDark={isDark}
                                                    currentTrackId={currentTrackId}
                                                    onTotalPlays={handleChannelTotalPlays}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* New Channels section */}
                    {(userChannels.length > 0 || newSystemChannels.length > 0) && (
                        <div className="mt-4 mb-1 px-2">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                                    <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${effectiveDark ? 'text-white/60' : 'text-slate-500'}`}>
                                        {isVietnamese ? 'Kênh Mới' : 'New Channels'}
                                    </p>
                                </div>
                                {newSystemChannels.length > 0 && (
                                    <button
                                        onClick={() => { setViewAllOpen(true); setViewAllSearch(''); }}
                                        className={`text-[10px] font-semibold transition-colors ${effectiveDark ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-700'}`}
                                    >
                                        {isVietnamese ? 'Xem tất cả' : 'View All'}
                                    </button>
                                )}
                            </div>
                            {userChannels.map(ch => renderChannelRow(ch, true))}
                            {newSystemChannels.map(ch => renderChannelRow(ch, false))}
                        </div>
                    )}
                </div>

                {/* Create Channel button */}
                <div className="flex-shrink-0 px-4 py-3 border-t" style={{ borderColor: effectiveDark ? 'rgba(255,255,255,0.08)' : 'rgba(203,213,225,0.7)' }}>
                    <button
                        onClick={() => setCreateChOpen(true)}
                        className={`w-full flex items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-semibold transition-all ${effectiveDark ? 'bg-white/[0.06] text-white/80 hover:bg-white/[0.1]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                        <Plus className="w-4 h-4" />
                        {isVietnamese ? 'Tạo kênh mới' : 'Create Channel'}
                    </button>
                </div>
            </div>
        );
    };

    const renderSearchTab = () => (
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* Search input */}
            <div className="px-4 py-3 border-b flex-shrink-0" style={{ borderColor: effectiveDark ? 'rgba(255,255,255,0.1)' : 'rgba(203,213,225,0.8)' }}>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Youtube className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-red-400`} />
                        <input
                            style={{ WebkitAppRegion: 'no-drag', pointerEvents: 'auto' } as React.CSSProperties}
                            type="text"
                            value={ytQuery}
                            onChange={e => setYtQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleYtSearch()}
                            placeholder={isVietnamese ? 'Tìm bài hát trên YouTube…' : 'Search YouTube…'}
                            className={`w-full pl-8 pr-3 py-2.5 rounded-2xl text-sm border backdrop-blur-sm select-text ${inputCls} outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15`}
                        />
                    </div>
                    <button
                        onClick={handleYtSearch}
                        disabled={ytLoading || !ytQuery.trim()}
                        className="px-3 py-2.5 rounded-2xl text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 flex-shrink-0 shadow-[0_12px_24px_rgba(79,70,229,0.24)]"
                        style={{ background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)' }}
                    >
                        {ytLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    </button>
                </div>
                {ytError && (
                    <div className={`mt-2 rounded-2xl px-3 py-3 text-xs border ${effectiveDark ? 'bg-amber-500/10 border-amber-400/20 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                        <p className="font-semibold mb-1">⚠️ {isVietnamese ? 'Không thể tải bài hát này' : 'Could not download this track'}</p>
                        <p className="leading-relaxed">
                            {isVietnamese
                                ? 'Không phải bài hát nào cũng tải được. Bạn có thể tải thủ công tại '
                                : "Not all tracks can be downloaded. You can get it manually at "}
                            <a
                                href="https://v1.y2mate.nu/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline font-semibold hover:opacity-80"
                            >v1.y2mate.nu</a>
                            {isVietnamese ? ', sau đó upload file MP3 vào playlist.' : ', then upload the MP3 file into your playlist.'}
                        </p>
                    </div>
                )}
            </div>

            {/* Results */}
            <div className={`flex-1 overflow-y-auto px-2 py-2 [scrollbar-width:auto] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full ${effectiveDark ? '[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/12' : '[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300/80'}`}>
                {ytLoading && (
                    <div className="py-12 flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-red-400" />
                        <p className={`text-sm ${textSec}`}>
                            {isVietnamese ? 'Đang tìm kiếm…' : 'Searching YouTube…'}
                        </p>
                    </div>
                )}
                {!ytLoading && ytResults.map(r => {
                    const isSelected = selectedYtId === r.youtube_id;
                    const isImporting = importingYtId === r.youtube_id;
                    return (
                        <div key={r.youtube_id}
                            className={`flex gap-3 rounded-2xl px-4 py-3 cursor-pointer transition-all ${isSelected ? (effectiveDark ? 'bg-white/[0.08] shadow-[0_12px_30px_rgba(15,23,42,0.25)]' : 'bg-white shadow-[0_12px_28px_rgba(79,70,229,0.08)]') : hoverCls}`}
                            onClick={() => setSelectedYtId(isSelected ? null : r.youtube_id)}
                        >
                            {/* Thumbnail */}
                            <div className="relative w-16 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-800">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={r.thumbnail} alt="" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <Play className="w-4 h-4 text-white" fill="currentColor" />
                                </div>
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className={`text-xs font-medium line-clamp-2 leading-tight ${textPrimary}`}>{r.title}</p>
                                <p className={`text-[10px] mt-0.5 ${textSec}`}>{r.artist} · {fmtDur(r.duration_sec)}</p>
                                {isSelected && (
                                    <div className="flex gap-2 mt-2">
                                        <button
                                            onClick={e => { e.stopPropagation(); handleImportAndPlay(r); }}
                                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-white text-[11px] font-semibold"
                                            style={{ background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)' }}
                                        >
                                            <Play className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={e => { e.stopPropagation(); handleImportAndAddToPlaylist(r); }}
                                            disabled={addedYtIds.has(r.youtube_id)}
                                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold disabled:opacity-50 ${addedYtIds.has(r.youtube_id) ? 'bg-green-500/20 text-green-400' : (effectiveDark ? 'bg-white/[0.08] text-slate-100 hover:bg-white/[0.12]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}`}
                                        >
                                            {addedYtIds.has(r.youtube_id) ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                            {addedYtIds.has(r.youtube_id) ? (isVietnamese ? 'Đã thêm rồi' : 'Added') : (isVietnamese ? 'Thêm vào playlist' : 'Add to playlist')}
                                        </button>
                                    </div>
                                )}
                            </div>
                            {/* Radio */}
                            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1 flex items-center justify-center ${isSelected ? 'border-indigo-500 bg-indigo-500' : (effectiveDark ? 'border-white/20' : 'border-slate-300')}`}>
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                        </div>
                    );
                })}
                {!ytLoading && ytResults.length === 0 && ytQuery && !ytError && (
                    <div className="py-12 text-center">
                        <Youtube className="w-10 h-10 mx-auto text-gray-600 mb-3" />
                        <p className={`text-sm ${textSec}`}>
                            {isVietnamese ? 'Không tìm thấy kết quả' : 'No results found'}
                        </p>
                    </div>
                )}
                {!ytLoading && ytResults.length === 0 && !ytQuery && (
                    <div className="py-12 text-center px-6">
                        <Youtube className="w-10 h-10 mx-auto text-red-400 mb-3" />
                        <p className={`text-sm font-medium ${textPrimary} mb-1`}>
                            {isVietnamese ? 'Tìm kiếm trên YouTube' : 'Search YouTube'}
                        </p>
                        <p className={`text-xs ${textSec}`}>
                            {isVietnamese
                                ? 'Tìm bài hát bất kỳ, chọn và thêm vào playlist hoặc phát ngay'
                                : 'Search any song, select it and play or add to playlist'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );

    const renderImportTab = () => (
        <div className={`flex flex-col flex-1 overflow-y-auto p-4 gap-4 [scrollbar-width:auto] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full ${effectiveDark ? '[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/12' : '[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300/80'}`}>
            {/* Existing: guidance text */}
            <div className={`rounded-2xl p-4 border ${effectiveDark ? 'bg-white/[0.05] border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)' }}>
                        <LinkIcon className="w-4 h-4 text-white" />
                    </div>
                    <p className={`text-sm leading-relaxed ${textSec}`}>
                        {isVietnamese
                            ? <>Để lấy file âm thanh, bạn có thể tìm kiếm trên Google với các từ khóa như: <span className={`font-semibold ${textPrimary}`}>&ldquo;YouTube to MP3&rdquo;</span> hoặc <span className={`font-semibold ${textPrimary}`}>&ldquo;TikTok audio downloader&rdquo;</span>, sau đó lưu file về máy và tải lên đây.</>
                            : <>To get audio files, search Google for keywords like <span className={`font-semibold ${textPrimary}`}>&ldquo;YouTube to MP3&rdquo;</span> or <span className={`font-semibold ${textPrimary}`}>&ldquo;TikTok audio downloader&rdquo;</span>, then save the file to your device and upload it here.</>
                        }
                    </p>
                </div>
            </div>
            <button
                onClick={() => setActiveTab('playlists')}
                className="flex items-center justify-center gap-2 py-2.5 rounded-2xl text-white text-sm font-semibold transition-all shadow-[0_12px_24px_rgba(79,70,229,0.24)]"
                style={{ background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)' }}
            >
                <Upload className="w-4 h-4" />
                {isVietnamese ? 'Tải file MP3 lên playlist' : 'Upload MP3 to playlist'}
            </button>

            {/* Add YouTube URL to playlist */}
            <div className={`rounded-2xl p-4 border flex flex-col gap-3 ${effectiveDark ? 'bg-white/[0.05] border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-2">
                    <Youtube className="w-4 h-4 text-red-500" />
                    <span className={`text-sm font-semibold ${textPrimary}`}>
                        {isVietnamese ? 'Thêm video YouTube vào playlist' : 'Add YouTube video to playlist'}
                    </span>
                </div>
                <p className={`text-xs ${textSec}`}>
                    {isVietnamese
                        ? 'Dán link YouTube — video sẽ phát trực tiếp trong playlist của bạn.'
                        : 'Paste a YouTube link — the video plays directly in your playlist.'}
                </p>
                <div className="flex gap-2">
                    <input
                        type="url"
                        value={urlLinkInput}
                        onChange={e => { setUrlLinkInput(e.target.value); setUrlLinkError(''); }}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddUrlToPlaylist('add'); }}
                        placeholder="https://youtube.com/watch?v=..."
                        className={`flex-1 min-w-0 px-3 py-2 rounded-xl text-sm border outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 ${inputCls}`}
                    />
                </div>
                {urlLinkError && (
                    <p className="text-xs text-red-400">{urlLinkError}</p>
                )}
                <div className="flex gap-2">
                    <button
                        onClick={() => handleAddUrlToPlaylist('play')}
                        disabled={!urlLinkInput.trim()}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' }}
                    >
                        <Play className="w-3 h-3" />
                        {isVietnamese ? 'Phát ngay' : 'Play now'}
                    </button>
                    <button
                        onClick={() => handleAddUrlToPlaylist('add')}
                        disabled={!urlLinkInput.trim()}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)' }}
                    >
                        <Plus className="w-3 h-3" />
                        {isVietnamese ? 'Thêm vào playlist' : 'Add to playlist'}
                    </button>
                </div>
            </div>

            {/* Add Facebook Reel URL to playlist */}
            <div className={`rounded-2xl p-4 border flex flex-col gap-3 ${effectiveDark ? 'bg-white/[0.05] border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-2">
                    {/* Facebook brand icon */}
                    <div className="w-4 h-4 rounded bg-[#1877F2] flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold" style={{ fontSize: 10, lineHeight: 1 }}>f</span>
                    </div>
                    <span className={`text-sm font-semibold ${textPrimary}`}>
                        {isVietnamese ? 'Thêm Facebook Reel vào playlist' : 'Add Facebook Reel to playlist'}
                    </span>
                </div>
                <p className={`text-xs ${textSec}`}>
                    {isVietnamese
                        ? 'Dán link Facebook Reel — video phát trực tiếp trong playlist của bạn.'
                        : 'Paste a Facebook Reel link — the video plays directly in your playlist.'}
                </p>
                <div className="flex gap-2">
                    <input
                        type="url"
                        value={urlLinkInput}
                        onChange={e => { setUrlLinkInput(e.target.value); setUrlLinkError(''); }}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddUrlToPlaylist('add'); }}
                        placeholder="https://www.facebook.com/reel/123... hoặc watch/?v=..."
                        className={`flex-1 min-w-0 px-3 py-2 rounded-xl text-sm border outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 ${inputCls}`}
                    />
                </div>
                {urlLinkError && (
                    <p className="text-xs text-red-400">{urlLinkError}</p>
                )}
                <div className="flex gap-2">
                    <button
                        onClick={() => handleAddUrlToPlaylist('play')}
                        disabled={!urlLinkInput.trim()}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' }}
                    >
                        <Play className="w-3 h-3" />
                        {isVietnamese ? 'Phát ngay' : 'Play now'}
                    </button>
                    <button
                        onClick={() => handleAddUrlToPlaylist('add')}
                        disabled={!urlLinkInput.trim()}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: 'linear-gradient(135deg, #1877F2 0%, #0a5bcc 100%)' }}
                    >
                        <Plus className="w-3 h-3" />
                        {isVietnamese ? 'Thêm vào playlist' : 'Add to playlist'}
                    </button>
                </div>
            </div>
        </div>
    );

    const renderPlaylistsTab = () => (
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header + create button */}
            <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0"
                style={{ borderColor: effectiveDark ? 'rgba(255,255,255,0.1)' : 'rgba(203,213,225,0.8)' }}>
                <span className={`text-sm font-medium ${textPrimary}`}>
                    {isVietnamese ? 'Playlist của tôi' : 'My Playlists'}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => uploadInputRef.current?.click()}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold border ${effectiveDark ? 'border-white/15 text-slate-300 hover:bg-white/[0.08]' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                        title={isVietnamese ? 'Upload MP3' : 'Upload MP3'}
                    >
                        <Upload className="w-3 h-3" />
                        MP3
                    </button>
                    <button
                        onClick={() => setCreatingPlaylist(true)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-white text-xs font-semibold shadow-[0_12px_24px_rgba(79,70,229,0.24)]"
                        style={{ background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)' }}
                    >
                        <Plus className="w-4 h-4" />
                        {isVietnamese ? 'Playlist' : 'Playlist'}
                    </button>
                </div>
            </div>

            <div className={`flex-1 overflow-y-auto px-2 py-2 [scrollbar-width:auto] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full ${effectiveDark ? '[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/12' : '[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300/80'}`}>
                {/* Create playlist form */}
                {creatingPlaylist && (
                    <div className={`mx-2 mt-2 rounded-[24px] p-3 border backdrop-blur-sm ${effectiveDark ? 'bg-white/[0.06] border-white/10' : 'bg-white/85 border-slate-200/80'}`}>
                        <input
                            type="text"
                            value={newPlaylistName}
                            onChange={e => setNewPlaylistName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleCreatePlaylist(); if (e.key === 'Escape') setCreatingPlaylist(false); }}
                            placeholder={isVietnamese ? 'Tên playlist…' : 'Playlist name…'}
                            className={`w-full px-3 py-2.5 rounded-2xl text-sm border ${inputCls} outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 mb-2`}
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <button onClick={() => { void handleCreatePlaylist(); }} className="flex-1 py-2 rounded-2xl text-white text-xs font-semibold" style={{ background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)' }}>
                                {isVietnamese ? 'Tạo' : 'Create'}
                            </button>
                            <button onClick={() => setCreatingPlaylist(false)} className={`flex-1 py-2 rounded-2xl text-xs font-semibold ${effectiveDark ? 'bg-white/[0.08] text-slate-200' : 'bg-slate-100 text-slate-600'}`}>
                                {isVietnamese ? 'Hủy' : 'Cancel'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Upload review panel */}
                {uploadFiles.length > 0 && (
                    <div className={`mx-2 mt-2 rounded-[24px] p-4 border backdrop-blur-sm ${effectiveDark ? 'bg-indigo-950/60 border-indigo-500/20' : 'bg-indigo-50 border-indigo-200'}`}>
                        <div className="flex items-center gap-2 mb-3">
                            <Upload className="w-3.5 h-3.5 text-indigo-400" />
                            <p className={`text-xs font-semibold ${textPrimary}`}>
                                {uploadFiles.length} {isVietnamese ? 'file đã chọn' : 'file(s) selected'}
                            </p>
                        </div>

                        {/* File list preview */}
                        <div className={`max-h-[80px] overflow-y-auto mb-3 space-y-1 [scrollbar-width:thin] ${effectiveDark ? '[&::-webkit-scrollbar-thumb]:bg-white/20' : '[&::-webkit-scrollbar-thumb]:bg-slate-300'}`}>
                            {uploadFiles.map((f, i) => (
                                <div key={i} className={`flex items-center gap-2 text-[11px] ${textSec}`}>
                                    <Music2 className="w-3 h-3 flex-shrink-0 text-indigo-400" />
                                    <span className="truncate">{f.name.replace(/\.[^.]+$/, '')}</span>
                                </div>
                            ))}
                        </div>

                        {/* Destination selector */}
                        <label className={`text-[11px] font-medium ${textSec} mb-1 block`}>
                            {isVietnamese ? 'Thêm vào:' : 'Add to:'}
                        </label>
                        <div className="relative mb-2">
                            <select
                                value={uploadTargetId}
                                onChange={e => setUploadTargetId(e.target.value)}
                                className={`w-full px-3 pr-7 py-2 rounded-2xl text-xs border appearance-none ${inputCls} outline-none focus:border-indigo-500`}
                            >
                                <option value="">{isVietnamese ? '+ Tạo playlist mới' : '+ New playlist'}</option>
                                {playlists.map(pl => (
                                    <option key={pl.id} value={pl.id}>{pl.name}</option>
                                ))}
                            </select>
                            <ChevronDown className={`absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none ${textSec}`} />
                        </div>

                        {!uploadTargetId && (
                            <input
                                type="text"
                                value={uploadNewName}
                                onChange={e => setUploadNewName(e.target.value)}
                                placeholder={isVietnamese ? 'Tên playlist mới…' : 'New playlist name…'}
                                className={`w-full px-3 py-2 rounded-2xl text-xs border ${inputCls} outline-none focus:border-indigo-500 mb-2`}
                            />
                        )}

                        {uploadProcessing && (
                            <div className="mb-2">
                                <div className={`h-1.5 rounded-full overflow-hidden ${effectiveDark ? 'bg-white/10' : 'bg-slate-200'}`}>
                                    <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                                </div>
                                <p className={`text-[10px] mt-1 ${textSec}`}>{uploadProgress}%</p>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={handleUploadCancel}
                                disabled={uploadProcessing}
                                className={`flex-1 py-2 rounded-2xl text-xs font-semibold disabled:opacity-50 ${effectiveDark ? 'bg-white/[0.08] text-slate-200' : 'bg-slate-100 text-slate-600'}`}
                            >
                                {isVietnamese ? 'Hủy' : 'Cancel'}
                            </button>
                            <button
                                onClick={() => { void handleConfirmUpload(); }}
                                disabled={uploadProcessing}
                                className="flex-1 py-2 rounded-2xl text-white text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
                                style={{ background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)' }}
                            >
                                {uploadProcessing
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <Upload className="w-3 h-3" />
                                }
                                {uploadProcessing
                                    ? (isVietnamese ? 'Đang lưu…' : 'Saving…')
                                    : (isVietnamese ? 'Lưu' : 'Save')
                                }
                            </button>
                        </div>
                    </div>
                )}

                {playlistError && (
                    <div className={`mx-2 mt-2 rounded-2xl px-4 py-3 text-xs ${effectiveDark ? 'bg-rose-500/10 text-rose-200 border border-rose-400/20' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
                        {playlistError}
                    </div>
                )}

                {playlistsLoading && (
                    <div className="flex justify-center py-8">
                        <Loader2 className={`w-5 h-5 animate-spin ${effectiveDark ? 'text-white/70' : 'text-slate-500'}`} />
                    </div>
                )}

                {/* Playlist list */}
                {!playlistsLoading && playlists.length === 0 && !creatingPlaylist && !playlistError && (
                    <div className="py-12 text-center px-6">
                        <ListMusic className={`w-10 h-10 mx-auto mb-3 ${textMuted}`} />
                        {!user ? (
                            <>
                                <p className={`text-sm font-medium ${textPrimary} mb-1`}>
                                    {isVietnamese ? 'Chưa đăng nhập' : 'Not signed in'}
                                </p>
                                <p className={`text-xs ${textSec}`}>
                                    {isVietnamese
                                        ? 'Đăng nhập để xem playlist của bạn'
                                        : 'Sign in to see your playlists'}
                                </p>
                                <button
                                    onClick={() => { window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname); }}
                                    className="mt-4 px-4 py-2 rounded-2xl text-white text-xs font-semibold"
                                    style={{ background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)' }}
                                >
                                    {isVietnamese ? 'Đăng nhập' : 'Sign in'}
                                </button>
                            </>
                        ) : (
                            <>
                                <p className={`text-sm font-medium ${textPrimary} mb-1`}>
                                    {isVietnamese ? 'Chưa có playlist nào' : 'No playlists yet'}
                                </p>
                                <p className={`text-xs ${textSec}`}>
                                    {isVietnamese
                                        ? 'Tạo playlist để lưu nhạc yêu thích'
                                        : 'Create a playlist to save your favorite tracks'}
                                </p>
                            </>
                        )}
                    </div>
                )}

                {playlists.map(pl => {
                    const isExp = expandedPlaylist === pl.id;
                    const trackQ = (plTrackSearch[pl.id] ?? '').toLowerCase();
                    return (
                        <div key={pl.id}>
                            {/* Row 1: icon | name / count | publish | play | expand */}
                            <button
                                onClick={() => setExpandedPlaylist(isExp ? null : pl.id)}
                                onMouseEnter={e => showHover(e, { name: pl.name, trackCount: pl.tracks.length })}
                                onMouseLeave={hideHover}
                                className={`w-full flex items-center gap-3 rounded-2xl px-4 pt-3 pb-1 text-left transition-all ${hoverCls}`}
                            >
                                <div className={`w-8 h-8 rounded-2xl flex items-center justify-center flex-shrink-0 ${secondarySurface}`}>
                                    <ListMusic className="w-4 h-4" style={{ color: accentPrimary }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium truncate ${textPrimary}`}>{pl.name}</p>
                                    <p className={`text-[11px] ${textSec}`}>
                                        {pl.tracks.length} {isVietnamese ? 'bài' : 'tracks'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* Publish / unpublish channel */}
                                    {pl.tracks.length > 0 && user && (
                                        <button
                                            onClick={e => { e.stopPropagation(); handleTogglePublish(pl); }}
                                            disabled={publishingId === pl.id}
                                            title={publishedIds.has(pl.id)
                                                ? (isVietnamese ? 'Hủy công khai' : 'Unpublish channel')
                                                : (isVietnamese ? 'Đăng làm kênh công khai' : 'Publish as channel')}
                                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${publishedIds.has(pl.id)
                                                ? 'text-indigo-400 bg-indigo-500/15 hover:bg-indigo-500/25'
                                                : (effectiveDark ? 'text-slate-400/60 hover:text-indigo-300 hover:bg-white/[0.08]' : 'text-slate-400 hover:text-indigo-500 hover:bg-slate-100')
                                                }`}
                                        >
                                            {publishingId === pl.id
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : <Globe className="w-3.5 h-3.5" />
                                            }
                                        </button>
                                    )}
                                    {pl.tracks.length > 0 && (
                                        <button
                                            onClick={e => { e.stopPropagation(); onPlayTracks(pl.tracks, 0, pl.id, pl.name); onClose(); }}
                                            className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-[0_10px_20px_rgba(79,70,229,0.24)]"
                                            style={{ background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)' }}
                                        >
                                            <Play className="w-3 h-3" fill="currentColor" />
                                        </button>
                                    )}
                                    {pl.tracks.length === 0 && (
                                        <button
                                            onClick={e => { e.stopPropagation(); setConfirmDeleteId(pl.id); }}
                                            title={isVietnamese ? 'Xóa playlist' : 'Delete playlist'}
                                            className={`w-8 h-8 rounded-full flex items-center justify-center ${effectiveDark ? 'text-slate-400/60 hover:text-rose-300 hover:bg-white/[0.08]' : 'text-slate-400 hover:text-rose-500 hover:bg-slate-100'}`}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    {isExp ? <ChevronDown className={`w-4 h-4 ${textSec}`} /> : <ChevronRight className={`w-4 h-4 ${textSec}`} />}
                                </div>
                            </button>

                            {/* Row 2: Shuffle toggle + local track search */}
                            {pl.tracks.length > 0 && (
                                <div className={`flex items-center gap-2 px-4 pb-2.5`} onClick={e => e.stopPropagation()}>
                                    <button
                                        onClick={() => onToggleShuffle?.()}
                                        title={isShuffle ? (isVietnamese ? 'Shuffle đang BẬT' : 'Shuffle ON') : (isVietnamese ? 'Shuffle đang TẮT' : 'Shuffle OFF')}
                                        className={`flex-shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold transition-colors border ${isShuffle
                                            ? 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30'
                                            : (effectiveDark ? 'text-slate-400/70 border-white/10 hover:border-white/20 hover:text-white/70' : 'text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600')}`}
                                    >
                                        <Shuffle className="w-3 h-3" />
                                        <span>{isVietnamese ? 'Xáo trộn' : 'Shuffle'}</span>
                                    </button>
                                    <div className="relative flex-1">
                                        <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 ${textSec}`} />
                                        <input
                                            type="text"
                                            value={plTrackSearch[pl.id] ?? ''}
                                            onChange={e => setPlTrackSearch(prev => ({ ...prev, [pl.id]: e.target.value }))}
                                            placeholder={isVietnamese ? 'Tìm trong playlist…' : 'Search tracks…'}
                                            className={`w-full h-7 pl-7 pr-3 rounded-full text-[11px] border outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 ${inputCls}`}
                                        />
                                    </div>
                                </div>
                            )}

                            {isExp && (
                                <div className="ml-2 mb-1">
                                    {pl.tracks.length === 0 ? (
                                        <p className={`px-4 py-3 text-xs ${textSec}`}>
                                            {isVietnamese ? 'Playlist trống' : 'Empty playlist'}
                                        </p>
                                    ) : (
                                        pl.tracks.filter(t => !trackQ || t.title.toLowerCase().includes(trackQ) || t.artist.toLowerCase().includes(trackQ)).map((t, i) => {
                                            const origIdx = pl.tracks.findIndex(x => x.id === t.id);
                                            const isActivePlaying = t.id === currentTrackId;
                                            const isRenaming = renamingTrack?.trackId === t.id && renamingTrack?.playlistId === pl.id;
                                            return (
                                                <div
                                                    key={t.id}
                                                    onContextMenu={e => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setContextMenu({ trackId: t.id, playlistId: pl.id, trackTitle: t.title, x: e.clientX, y: e.clientY });
                                                    }}
                                                    className={`group w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${isActivePlaying
                                                        ? (effectiveDark ? 'bg-indigo-500/10' : 'bg-indigo-50')
                                                        : (effectiveDark ? 'hover:bg-white/[0.07]' : 'hover:bg-slate-100/80')
                                                        }`}
                                                    onClick={() => { if (!isRenaming) { onPlayTracks(pl.tracks, origIdx, pl.id, pl.name); onClose(); } }}
                                                >
                                                    {/* Track number → play icon on hover, music icon if active */}
                                                    <div className="w-5 flex-shrink-0 flex items-center justify-center">
                                                        {isActivePlaying ? (
                                                            <AudioWaveform className="w-3 h-3" style={{ color: accentPrimary }} />
                                                        ) : (
                                                            <>
                                                                <span className={`text-[10px] group-hover:hidden ${textSec}`}>{i + 1}</span>
                                                                <Play className="w-3 h-3 hidden group-hover:block fill-current" style={{ color: accentPrimary }} />
                                                            </>
                                                        )}
                                                    </div>
                                                    {/* Thumbnail if available */}
                                                    {t.thumbnailUrl && !isRenaming && (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={t.thumbnailUrl} alt="" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                                                    )}
                                                    <div className="flex-1 min-w-0" onClick={e => isRenaming && e.stopPropagation()}>
                                                        {isRenaming ? (
                                                            <input
                                                                autoFocus
                                                                value={renamingTrack.value}
                                                                onChange={e => setRenamingTrack(prev => prev ? { ...prev, value: e.target.value } : null)}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') { e.preventDefault(); void handleRenameTrackSave(); }
                                                                    if (e.key === 'Escape') setRenamingTrack(null);
                                                                }}
                                                                onBlur={() => void handleRenameTrackSave()}
                                                                className={`w-full text-xs px-2 py-1 rounded-lg border outline-none focus:border-indigo-500 ${effectiveDark ? 'bg-white/10 border-white/20 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                                                            />
                                                        ) : (
                                                            <>
                                                                <p className={`text-xs font-medium truncate ${isActivePlaying ? (effectiveDark ? 'text-indigo-300' : 'text-indigo-600') : textPrimary}`}>{t.title}</p>
                                                                {t.artist && <p className={`text-[10px] truncate ${textSec}`}>{t.artist}</p>}
                                                            </>
                                                        )}
                                                    </div>
                                                    {!isRenaming && <span className={`text-[10px] flex-shrink-0 group-hover:opacity-0 ${textSec}`}>{fmtDur(t.durationSec)}</span>}
                                                    {!isRenaming && (
                                                        <button
                                                            onClick={e => { e.stopPropagation(); void handleRemoveTrackFromPlaylist(pl.id, t.id); }}
                                                            className={`w-5 h-5 rounded flex-shrink-0 items-center justify-center hidden group-hover:flex transition-colors ${effectiveDark ? 'text-slate-400/60 hover:text-rose-300' : 'text-slate-400 hover:text-rose-500'}`}
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );

    // ── Add-to-playlist picker popup ──────────────────────────────────────────

    const PlaylistPicker = () => {
        if (!pickerOpen || !addingTrack) return null;
        return createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className={`w-full max-w-sm rounded-[28px] shadow-2xl flex flex-col max-h-[80vh] border ${effectiveDark ? 'bg-[#0b1228] border-white/10' : 'bg-white border-slate-200/80'}`} style={panelStyle}>
                    <div className={`flex-shrink-0 p-4 border-b flex items-center justify-between ${border}`}>
                        <div>
                            <p className={`text-sm font-semibold ${textPrimary}`}>
                                {isVietnamese ? 'Thêm vào Playlist' : 'Add to Playlist'}
                            </p>
                            <p className={`text-xs ${textSec} mt-0.5 truncate max-w-[200px]`}>{addingTrack.title}</p>
                        </div>
                        <button onClick={() => setPickerOpen(false)} className={textSec}>
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {playlists.length === 0 ? (
                            <p className={`text-sm text-center py-6 ${textSec}`}>
                                {isVietnamese ? 'Chưa có playlist. Tạo playlist trước.' : 'No playlists. Create one first.'}
                            </p>
                        ) : (
                            playlists.map(pl => (
                                <button
                                    key={pl.id}
                                    onClick={() => handleAddTrackToPlaylist(pl.id)}
                                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-colors ${hoverCls}`}
                                >
                                    <ListMusic className="w-4 h-4 flex-shrink-0" style={{ color: accentPrimary }} />
                                    <div className="flex-1">
                                        <p className={`text-sm font-medium ${textPrimary}`}>{pl.name}</p>
                                        <p className={`text-xs ${textSec}`}>{pl.tracks.length} tracks</p>
                                    </div>
                                    {pl.tracks.some(t => t.id === addingTrack.id) && (
                                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>,
            document.body
        );
    };

    // ── Local Library tab renderer ────────────────────────────────────────────

    const renderLocalTab = () => {
        const isTauri = typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).__TAURI_DESKTOP__;
        return (
            <div className="flex flex-col flex-1 overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0"
                    style={{ borderColor: effectiveDark ? 'rgba(255,255,255,0.1)' : 'rgba(203,213,225,0.8)' }}>
                    <div className="flex items-center gap-2">
                        <HardDrive className={`w-4 h-4 ${effectiveDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
                        <span className={`text-sm font-medium ${textPrimary}`}>
                            {isVietnamese ? 'Thư viện nhạc local' : 'Local Library'}
                        </span>
                    </div>
                    {isTauri && (
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={handleAddLocalFiles}
                                disabled={localProcessing}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${effectiveDark ? 'border-white/15 text-slate-300 hover:bg-white/[0.08]' : 'border-slate-200 text-slate-600 hover:bg-slate-100'} disabled:opacity-50`}
                                title={isVietnamese ? 'Chọn file nhạc' : 'Add audio files'}
                            >
                                {localProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <FilePlus2 className="w-3 h-3" />}
                                {isVietnamese ? 'File' : 'Files'}
                            </button>
                            <button
                                onClick={handleAddLocalFolder}
                                disabled={localProcessing}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${effectiveDark ? 'border-white/15 text-slate-300 hover:bg-white/[0.08]' : 'border-slate-200 text-slate-600 hover:bg-slate-100'} disabled:opacity-50`}
                                title={isVietnamese ? 'Mở folder nhạc' : 'Open music folder'}
                            >
                                {localProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderOpen className="w-3 h-3" />}
                                {isVietnamese ? 'Folder' : 'Folder'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Error */}
                {localError && (
                    <p className="px-4 py-2 text-xs text-rose-400">{localError}</p>
                )}

                {/* Not desktop notice */}
                {!isTauri && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
                        <HardDrive className={`w-10 h-10 ${effectiveDark ? 'text-white/20' : 'text-slate-300'}`} />
                        <p className={`text-sm ${textSec}`}>
                            {isVietnamese
                                ? 'Tính năng Local Library chỉ có trên WynAI Music Desktop.'
                                : 'Local Library is only available on WynAI Music Desktop.'}
                        </p>
                    </div>
                )}

                {/* Empty state */}
                {isTauri && !localProcessing && localPlaylists.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
                        <FolderOpen className={`w-10 h-10 ${effectiveDark ? 'text-white/20' : 'text-slate-300'}`} />
                        <p className={`text-sm ${textSec}`}>
                            {isVietnamese
                                ? 'Chưa có nhạc local. Nhấn "Files" để chọn file hoặc "Folder" để mở cả thư mục.'
                                : 'No local music yet. Click "Files" to pick audio files or "Folder" to open a directory.'}
                        </p>
                    </div>
                )}

                {/* Local playlists list */}
                {isTauri && localPlaylists.length > 0 && localPlaylists[0] && (
                    <div className="flex-1 overflow-y-auto py-2">
                        <div className={`mx-3 mb-1 rounded-xl overflow-hidden`}>
                            {localPlaylists[0].tracks.map((t, i) => (
                                <div
                                    key={t.id}
                                    className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-all border-b ${effectiveDark ? 'hover:bg-white/[0.06] border-white/[0.04]' : 'hover:bg-slate-100 border-slate-100'}`}
                                    onClick={() => {
                                        onPlayTracks(localPlaylists[0].tracks.map(tr => ({
                                            id: tr.id, title: tr.title, artist: tr.artist,
                                            audioUrl: tr.audioUrl, durationSec: tr.durationSec,
                                            source: 'local',
                                        })), i, localPlaylists[0].id, localPlaylists[0].name);
                                        onClose();
                                    }}
                                >
                                    <span className={`text-xs w-6 text-right flex-shrink-0 ${textSec}`}>{i + 1}</span>
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mx-2"
                                        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%)' }}>
                                        <HardDrive className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium truncate ${textPrimary}`}>{t.title || t.filePath.split(/[\\/]/).pop()}</p>
                                        {t.artist && <p className={`text-xs truncate ${textSec}`}>{t.artist}</p>}
                                    </div>
                                    {t.durationSec > 0 && (
                                        <span className={`text-xs flex-shrink-0 ${textSec}`}>
                                            {Math.floor(t.durationSec / 60)}:{String(Math.round(t.durationSec % 60)).padStart(2, '0')}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ── Tab bar ───────────────────────────────────────────────────────────────

    const tabs: { id: Tab; label: string; labelVi: string; icon: React.ReactNode }[] = [
        { id: 'local', label: 'Local', labelVi: 'Local', icon: <HardDrive className="w-3.5 h-3.5" /> },
        { id: 'playlists', label: 'Playlist', labelVi: 'Playlist', icon: <ListMusic className="w-3.5 h-3.5" /> },
        { id: 'channels', label: 'Channel', labelVi: 'Kênh', icon: <AudioWaveform className="w-3.5 h-3.5" /> },
        { id: 'search', label: 'Search', labelVi: 'Tìm', icon: <Youtube className="w-3.5 h-3.5" /> },
        { id: 'import', label: 'Import', labelVi: 'Import', icon: <LinkIcon className="w-3.5 h-3.5" /> },
    ];

    const sidebarContent = (
        <>
            {/* Sidebar panel */}
            <div
                className={`fixed bottom-0 z-[400] flex flex-col shadow-[0_24px_80px_rgba(15,23,42,0.24)] transition-transform duration-300 ${topOffset === 0 ? 'top-0' : ''} ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
                style={{ ...panelStyle, width: isMobileViewport ? 300 : sidebarWidth, borderRight: `1px solid ${effectiveDark ? 'rgba(255,255,255,0.1)' : 'rgba(203,213,225,0.8)'}`, left: isMobileViewport ? 0 : (leftOffset ?? (homeSidebarCollapsed ? 52 : 252)), top: topOffset > 0 ? topOffset : undefined }}
            >
                {/* Resize handle — desktop only */}
                <div
                    onMouseDown={handleResizeStart}
                    className="absolute top-0 bottom-0 right-0 w-1.5 cursor-ew-resize hidden lg:block z-10 group"
                >
                    <div className={`absolute inset-y-0 right-0 w-px transition-colors group-hover:w-[3px] ${effectiveDark ? 'bg-white/10 group-hover:bg-indigo-500/60' : 'bg-slate-200 group-hover:bg-indigo-400/70'}`} />
                </div>
                {/* Header — data-tauri-drag-region + WebkitAppRegion:drag = window draggable from sidebar title bar */}
                <div
                    data-tauri-drag-region
                    style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
                    className={`flex-shrink-0 flex items-center justify-between px-4 py-3 border-b ${border}`}
                >
                    <div className="flex items-center gap-2" style={{ pointerEvents: 'none' }}>
                        <div className="w-8 h-8 rounded-2xl flex items-center justify-center text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)]" style={{ background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)' }}>
                            <AudioWaveform className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <span className={`block text-base font-semibold ${textPrimary}`}>
                                WynAI Music
                            </span>
                            <span className={`block text-[10px] uppercase tracking-[0.28em] ${textMuted}`}>
                                SOUND DECK
                            </span>
                        </div>
                    </div>
                    <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={onClose}
                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                        className={`w-8 h-8 rounded-full flex items-center justify-center lg:hidden ${effectiveDark ? 'text-slate-300/70 hover:bg-white/[0.08] hover:text-white' : 'text-slate-500 hover:bg-white hover:text-slate-900'}`}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Shorts button — wide, above tabs */}
                <div className="mx-3 mt-3 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={() => {
                            if (onOpenShorts) {
                                onOpenShorts();
                                if (isMobileViewport) onClose();
                            } else {
                                setShortsOpen(v => !v);
                            }
                        }}
                        className={`w-full flex items-center justify-center gap-2 rounded-[18px] py-2 text-[11px] font-semibold transition-all ${(isShortsActive || shortsOpen)
                            ? 'text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)]'
                            : (effectiveDark ? 'text-slate-300 hover:text-white hover:bg-white/[0.06]' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80')
                            }`}
                        style={(isShortsActive || shortsOpen) ? { background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)', WebkitAppRegion: 'no-drag' } as React.CSSProperties : { border: `1px solid ${effectiveDark ? 'rgba(255,255,255,0.1)' : 'rgba(203,213,225,0.8)'}`, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    >
                        <PlayCircle className="w-3.5 h-3.5" />
                        {isVietnamese ? '▶ Shorts / Trending' : '▶ Shorts / Trending'}
                    </button>
                </div>

                {/* Tab bar */}
                <div className={`mx-3 mt-2 flex-shrink-0 grid grid-cols-5 gap-1 rounded-[22px] border p-1 ${border} ${elevatedSurface}`} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => { setActiveTab(tab.id); setShortsOpen(false); }}
                            className={`flex flex-col items-center gap-1 rounded-[18px] py-2.5 text-[9px] font-semibold transition-all ${activeTab === tab.id && !shortsOpen
                                ? 'text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)]'
                                : `${textSec} ${effectiveDark ? 'hover:text-white hover:bg-white/[0.06]' : 'hover:text-slate-700 hover:bg-slate-100/80'}`
                                }`}
                            style={activeTab === tab.id && !shortsOpen ? { background: 'linear-gradient(135deg, #4338ca 0%, #1d4ed8 100%)', WebkitAppRegion: 'no-drag' } as React.CSSProperties : { WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                        >
                            {tab.icon}
                            {isVietnamese ? tab.labelVi : tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden pt-3">
                    {shortsOpen && renderShortsTab()}
                    {!shortsOpen && activeTab === 'channels' && renderChannelsTab()}
                    {!shortsOpen && activeTab === 'search' && renderSearchTab()}
                    {!shortsOpen && activeTab === 'import' && renderImportTab()}
                    {!shortsOpen && activeTab === 'playlists' && renderPlaylistsTab()}
                    {!shortsOpen && activeTab === 'local' && renderLocalTab()}
                </div>
            </div>

            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-[399] bg-black/40 lg:hidden"
                    onClick={onClose}
                />
            )}

            {/* Hover info tooltip (desktop only) */}
            {hoverInfo && !isMobileViewport && (
                <div
                    className={`fixed z-[500] pointer-events-none px-3.5 py-2.5 rounded-xl shadow-xl border max-w-[240px] transition-opacity duration-150`}
                    style={{
                        left: (isMobileViewport ? 300 : (leftOffset ?? (homeSidebarCollapsed ? 52 : 252)) + sidebarWidth) + 10,
                        top: hoverInfo.y - 36,
                        ...(effectiveDark
                            ? { background: '#0e1832', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 16px 40px rgba(0,0,0,0.5)' }
                            : { background: '#fff', border: '1px solid rgba(203,213,225,0.9)', boxShadow: '0 12px 32px rgba(0,0,0,0.12)' }),
                    }}
                >
                    {hoverInfo.accent && (
                        <div className="w-2 h-2 rounded-full mb-1.5" style={{ background: hoverInfo.accent }} />
                    )}
                    <p className={`text-xs font-semibold leading-snug ${effectiveDark ? 'text-white' : 'text-slate-900'}`}>{hoverInfo.name}</p>
                    {hoverInfo.subtitle && <p className={`text-[11px] mt-0.5 ${effectiveDark ? 'text-slate-400' : 'text-slate-500'}`}>{hoverInfo.subtitle}</p>}
                    {hoverInfo.description && <p className={`text-[11px] mt-1 leading-relaxed ${effectiveDark ? 'text-slate-500' : 'text-slate-400'}`}>{hoverInfo.description}</p>}
                    {hoverInfo.trackCount !== undefined && (
                        <p className={`text-[10px] mt-1 font-medium ${effectiveDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                            {hoverInfo.trackCount} {isVietnamese ? 'bài hát' : 'tracks'}
                        </p>
                    )}
                </div>
            )}

            <PlaylistPicker />

            {/* Hidden file input for MP3 upload */}
            <input
                ref={uploadInputRef}
                type="file"
                accept="audio/*,.mp3,.m4a,.ogg,.flac,.wav"
                multiple
                className="hidden"
                onChange={e => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) {
                        setActiveTab('playlists');
                        setUploadFiles(files);
                    }
                    e.target.value = '';
                }}
            />

            {/* View All Channels popup */}
            {viewAllOpen && createPortal(
                <div
                    className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
                    onClick={() => setViewAllOpen(false)}
                >
                    <div
                        className="w-full max-w-sm max-h-[80vh] flex flex-col rounded-2xl shadow-2xl"
                        style={effectiveDark
                            ? { background: 'linear-gradient(180deg, #0d1526 0%, #090f1f 100%)', border: '1px solid rgba(255,255,255,0.1)' }
                            : { background: '#fff', border: '1px solid rgba(203,213,225,0.8)' }
                        }
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: effectiveDark ? 'rgba(255,255,255,0.08)' : 'rgba(203,213,225,0.7)' }}>
                            <h3 className={`text-base font-semibold ${textPrimary}`}>{isVietnamese ? 'Tất cả kênh' : 'All Channels'}</h3>
                            <button onClick={() => setViewAllOpen(false)} className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${effectiveDark ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        {/* Search */}
                        <div className="flex-shrink-0 px-4 py-3">
                            <div className="relative">
                                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${textSec}`} />
                                <input
                                    type="text"
                                    value={viewAllSearch}
                                    onChange={e => { setViewAllSearch(e.target.value); setViewAllPage(0); }}
                                    autoFocus
                                    placeholder={isVietnamese ? 'Tìm channel…' : 'Search channels…'}
                                    className={`w-full pl-8 pr-3 py-2 rounded-2xl text-sm border outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 ${inputCls}`}
                                />
                            </div>
                        </div>
                        {/* Channel list */}
                        <div className={`flex-1 overflow-y-auto px-2 pb-3 [scrollbar-width:auto]`}>
                            {(() => {
                                const q = viewAllSearch.toLowerCase();
                                // Merge: hardcoded channels + user-created local + published community
                                const sysEntries = channels.map(ch => ({ slug: ch.slug, name: ch.name, label: ch.label, accent: ch.accent, isUser: false }));
                                const userEntries = userChannels.map(c => ({ slug: c.id, name: c.name, label: c.label, accent: c.accent, isUser: true }));
                                const pubEntries = publicChannels.map(pub => ({ slug: pub.id, name: pub.name, label: pub.description || 'community channel', accent: pub.accent, isUser: false }));
                                const seenSlugs = new Set<string>();
                                const allCh = [...sysEntries, ...userEntries, ...pubEntries].filter(c => { if (seenSlugs.has(c.slug)) return false; seenSlugs.add(c.slug); return true; });
                                const filtered = q ? allCh.filter(c => c.name.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)) : allCh;
                                const PAGE_SIZE = 20;
                                const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
                                const page = Math.min(viewAllPage, Math.max(0, totalPages - 1));
                                const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
                                if (filtered.length === 0) return (
                                    <p className={`py-8 text-center text-sm ${textMuted}`}>{isVietnamese ? 'Không tìm thấy' : 'No results'}</p>
                                );
                                return (
                                    <>
                                        {paged.map(ch => {
                                            const slug = ch.slug;
                                            const isSelected = slug === selectedChannelSlug;
                                            return (
                                                <button
                                                    key={slug}
                                                    onClick={() => { onSelectChannel(slug); setViewAllOpen(false); }}
                                                    className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all ${hoverCls} ${isSelected ? (effectiveDark ? 'bg-white/[0.08]' : 'bg-indigo-50') : ''}`}
                                                >
                                                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                                        style={{ background: `${ch.accent}20`, border: `1.5px solid ${ch.accent}40` }}>
                                                        <AudioWaveform className="w-3.5 h-3.5" style={{ color: ch.accent }} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-sm font-medium truncate ${textPrimary}`}>{ch.name}</p>
                                                        <p className={`text-[11px] truncate ${textSec}`}>{ch.label}</p>
                                                    </div>
                                                    {isSelected && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ch.accent }} />}
                                                </button>
                                            );
                                        })}
                                        {/* Pagination controls */}
                                        {totalPages > 1 && (
                                            <div className="flex items-center justify-between px-2 pt-3 pb-1 gap-2">
                                                <button
                                                    onClick={() => setViewAllPage(p => Math.max(0, p - 1))}
                                                    disabled={page === 0}
                                                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-30 ${effectiveDark ? 'bg-white/[0.07] text-white hover:bg-white/[0.12]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                                                >
                                                    <ChevronLeft className="w-3.5 h-3.5" />
                                                    {isVietnamese ? 'Trước' : 'Prev'}
                                                </button>
                                                <span className={`text-xs ${textSec}`}>
                                                    {page + 1} / {totalPages}
                                                    <span className={`ml-1.5 ${textMuted}`}>({filtered.length})</span>
                                                </span>
                                                <button
                                                    onClick={() => setViewAllPage(p => Math.min(totalPages - 1, p + 1))}
                                                    disabled={page >= totalPages - 1}
                                                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-30 ${effectiveDark ? 'bg-white/[0.07] text-white hover:bg-white/[0.12]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                                                >
                                                    {isVietnamese ? 'Sau' : 'Next'}
                                                    <ChevronRight className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {/* Create Channel modal */}
            {createChOpen && createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
                    onClick={() => setCreateChOpen(false)}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl shadow-2xl flex flex-col"
                        style={effectiveDark
                            ? { background: 'linear-gradient(180deg, #0d1526 0%, #090f1f 100%)', border: '1px solid rgba(255,255,255,0.1)' }
                            : { background: '#fff', border: '1px solid rgba(203,213,225,0.8)' }
                        }
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: effectiveDark ? 'rgba(255,255,255,0.08)' : 'rgba(203,213,225,0.7)' }}>
                            <h3 className={`text-base font-semibold ${textPrimary}`}>{isVietnamese ? 'Tạo kênh mới' : 'Create Channel'}</h3>
                            <button onClick={() => setCreateChOpen(false)} className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${effectiveDark ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        {/* Form */}
                        <div className="flex flex-col gap-4 px-5 py-4">
                            <div>
                                <label className={`block text-xs font-semibold mb-1.5 ${textSec}`}>{isVietnamese ? 'Tên kênh *' : 'Channel name *'}</label>
                                <input
                                    type="text"
                                    value={createChName}
                                    onChange={e => setCreateChName(e.target.value)}
                                    autoFocus
                                    placeholder={isVietnamese ? 'Ví dụ: Nhạc của tôi' : 'e.g. My Station'}
                                    className={`w-full px-4 py-2.5 rounded-2xl text-sm border outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 ${inputCls}`}
                                    onKeyDown={e => e.key === 'Enter' && handleCreateChannel()}
                                />
                            </div>
                            <div>
                                <label className={`block text-xs font-semibold mb-1.5 ${textSec}`}>{isVietnamese ? 'Nhãn (tuỳ chọn)' : 'Label (optional)'}</label>
                                <input
                                    type="text"
                                    value={createChLabel}
                                    onChange={e => setCreateChLabel(e.target.value)}
                                    placeholder={isVietnamese ? 'Mô tả ngắn…' : 'Short description…'}
                                    className={`w-full px-4 py-2.5 rounded-2xl text-sm border outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 ${inputCls}`}
                                />
                            </div>
                            <div>
                                <label className={`block text-xs font-semibold mb-2 ${textSec}`}>{isVietnamese ? 'Màu sắc' : 'Color'}</label>
                                <div className="flex gap-2 flex-wrap">
                                    {ACCENT_OPTIONS.map(color => (
                                        <button
                                            key={color}
                                            onClick={() => setCreateChAccent(color)}
                                            className={`w-7 h-7 rounded-full transition-all ${createChAccent === color ? 'ring-2 ring-offset-2 scale-110' : 'hover:scale-105'}`}
                                            style={{
                                                background: color,
                                                ringColor: color,
                                                ringOffsetColor: effectiveDark ? '#090f1f' : '#fff',
                                            } as React.CSSProperties}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                        {/* Footer */}
                        <div className="flex-shrink-0 flex gap-2 px-5 py-4 border-t" style={{ borderColor: effectiveDark ? 'rgba(255,255,255,0.08)' : 'rgba(203,213,225,0.7)' }}>
                            <button
                                onClick={() => setCreateChOpen(false)}
                                className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all ${effectiveDark ? 'bg-white/[0.06] text-white/80 hover:bg-white/[0.1]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                            >
                                {isVietnamese ? 'Hủy' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleCreateChannel}
                                disabled={!createChName.trim()}
                                className="flex-1 py-2.5 rounded-2xl text-sm font-semibold text-white disabled:opacity-40 transition-all"
                                style={{ background: createChAccent }}
                            >
                                {isVietnamese ? 'Tạo kênh' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {/* ── Publish Channel Modal ─────────────────────────────────── */}
            {publishModalOpen && publishModalPlaylist && typeof window !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
                    onClick={() => setPublishModalOpen(false)}
                >
                    <div
                        className={`w-full max-w-md max-h-[90vh] flex flex-col rounded-2xl shadow-2xl ${effectiveDark ? 'bg-[#0b1228] ring-1 ring-white/10' : 'bg-white ring-1 ring-slate-200'}`}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: effectiveDark ? 'rgba(255,255,255,0.08)' : 'rgba(203,213,225,0.7)' }}>
                            <div>
                                <h3 className={`text-base font-semibold ${textPrimary}`}>
                                    {publishedIds.has(publishModalPlaylist.id)
                                        ? (isVietnamese ? 'Chỉnh sửa kênh cộng đồng' : 'Edit Community Channel')
                                        : (isVietnamese ? 'Đăng làm kênh cộng đồng' : 'Publish as Community Channel')}
                                </h3>
                                <p className={`text-xs mt-0.5 ${textSec}`}>{publishModalPlaylist.name}</p>
                            </div>
                            <button onClick={() => setPublishModalOpen(false)} className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${effectiveDark ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        {/* Body */}
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                            {/* Channel Name */}
                            <div>
                                <label className={`block text-xs font-semibold mb-1.5 ${textSec}`}>{isVietnamese ? 'Tên kênh *' : 'Channel name *'}</label>
                                <input
                                    type="text"
                                    value={publishMeta.name}
                                    onChange={e => setPublishMeta(m => ({ ...m, name: e.target.value }))}
                                    placeholder={isVietnamese ? 'Tên kênh…' : 'Channel name…'}
                                    className={`w-full px-4 py-2.5 rounded-2xl text-sm border outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 ${inputCls}`}
                                />
                            </div>
                            {/* Description */}
                            <div>
                                <label className={`block text-xs font-semibold mb-1.5 ${textSec}`}>{isVietnamese ? 'Mô tả' : 'Description'}</label>
                                <textarea
                                    value={publishMeta.description ?? ''}
                                    onChange={e => setPublishMeta(m => ({ ...m, description: e.target.value }))}
                                    placeholder={isVietnamese ? 'Mô tả ngắn về kênh…' : 'Short description…'}
                                    rows={2}
                                    className={`w-full px-4 py-2.5 rounded-2xl text-sm border outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 resize-none ${inputCls}`}
                                />
                            </div>
                            {/* Genre + Mood row */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={`block text-xs font-semibold mb-1.5 ${textSec}`}>{isVietnamese ? 'Thể loại' : 'Genre'}</label>
                                    <div className="relative">
                                        <select
                                            value={publishMeta.genre ?? 'mixed'}
                                            onChange={e => setPublishMeta(m => ({ ...m, genre: e.target.value }))}
                                            className={`w-full px-3 pr-8 py-2.5 rounded-2xl text-xs border appearance-none outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 ${inputCls}`}
                                        >
                                            {[['mixed', 'Mixed / Tổng hợp'], ['pop', 'Pop'], ['rb', 'R&B'], ['hiphop', 'Hip-Hop'], ['rock', 'Rock'], ['electronic', 'Electronic'], ['jazz', 'Jazz'], ['classical', 'Classical'], ['lofi', 'Lo-fi'], ['indie', 'Indie'], ['acoustic', 'Acoustic'], ['country', 'Country'], ['latin', 'Latin'], ['kpop', 'K-Pop'], ['viet', 'Nhạc Việt']].map(([v, l]) => (
                                                <option key={v} value={v}>{l}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className={`absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none ${textSec}`} />
                                    </div>
                                </div>
                                <div>
                                    <label className={`block text-xs font-semibold mb-1.5 ${textSec}`}>{isVietnamese ? 'Tâm trạng' : 'Mood'}</label>
                                    <div className="relative">
                                        <select
                                            value={publishMeta.mood ?? ''}
                                            onChange={e => setPublishMeta(m => ({ ...m, mood: e.target.value }))}
                                            className={`w-full px-3 pr-8 py-2.5 rounded-2xl text-xs border appearance-none outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 ${inputCls}`}
                                        >
                                            <option value="">{isVietnamese ? 'Tuỳ chọn' : 'Any'}</option>
                                            {[['chill', 'Chill'], ['energetic', 'Energetic'], ['happy', 'Happy'], ['sad', 'Sad'], ['study', 'Study / Focus'], ['workout', 'Workout'], ['party', 'Party'], ['sleep', 'Sleep / Relax'], ['romance', 'Romance']].map(([v, l]) => (
                                                <option key={v} value={v}>{l}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className={`absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none ${textSec}`} />
                                    </div>
                                </div>
                            </div>
                            {/* Tags */}
                            <div>
                                <label className={`block text-xs font-semibold mb-1.5 ${textSec}`}>{isVietnamese ? 'Tags (phân cách bằng dấu phẩy)' : 'Tags (comma-separated)'}</label>
                                <input
                                    type="text"
                                    value={publishMeta.tags ?? ''}
                                    onChange={e => setPublishMeta(m => ({ ...m, tags: e.target.value }))}
                                    placeholder={isVietnamese ? 'e.g. nhạc chill, study, lofi…' : 'e.g. chill, study, lofi…'}
                                    className={`w-full px-4 py-2.5 rounded-2xl text-sm border outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 ${inputCls}`}
                                />
                            </div>
                            {/* Accent color */}
                            <div>
                                <label className={`block text-xs font-semibold mb-2 ${textSec}`}>{isVietnamese ? 'Màu sắc kênh' : 'Channel color'}</label>
                                <div className="flex gap-2 flex-wrap">
                                    {ACCENT_OPTIONS.map(color => (
                                        <button
                                            key={color}
                                            onClick={() => setPublishMeta(m => ({ ...m, accent: color }))}
                                            className={`w-7 h-7 rounded-full transition-all ${publishMeta.accent === color ? 'ring-2 ring-offset-2 scale-110' : 'hover:scale-105'}`}
                                            style={{ background: color, outlineColor: color, ringOffsetColor: effectiveDark ? '#0b1228' : '#fff' } as React.CSSProperties}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                        {/* Footer */}
                        <div className="flex-shrink-0 flex gap-2 px-5 py-4 border-t" style={{ borderColor: effectiveDark ? 'rgba(255,255,255,0.08)' : 'rgba(203,213,225,0.7)' }}>
                            {publishedIds.has(publishModalPlaylist.id) && (
                                <button
                                    onClick={() => void handleUnpublish(publishModalPlaylist)}
                                    className="px-4 py-2.5 rounded-2xl text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-all"
                                >
                                    {isVietnamese ? 'Hủy công khai' : 'Unpublish'}
                                </button>
                            )}
                            <div className="flex-1" />
                            <button
                                onClick={() => setPublishModalOpen(false)}
                                className={`px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all ${effectiveDark ? 'bg-white/[0.06] text-white/80 hover:bg-white/[0.1]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                            >
                                {isVietnamese ? 'Hủy' : 'Cancel'}
                            </button>
                            <button
                                onClick={() => void handlePublishSubmit()}
                                disabled={!publishMeta.name?.trim()}
                                className="px-5 py-2.5 rounded-2xl text-sm font-semibold text-white disabled:opacity-40 transition-all shadow-[0_10px_24px_rgba(79,70,229,0.24)]"
                                style={{ background: publishMeta.accent || '#4f46e5' }}
                            >
                                {publishedIds.has(publishModalPlaylist.id)
                                    ? (isVietnamese ? 'Lưu thay đổi' : 'Save changes')
                                    : (isVietnamese ? 'Đăng kênh' : 'Publish')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {/* ── Track right-click context menu ────────────────────────── */}
            {contextMenu && typeof window !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-[10000]"
                    onClick={() => setContextMenu(null)}
                    onContextMenu={e => { e.preventDefault(); setContextMenu(null); }}
                >
                    <div
                        className={`absolute min-w-[180px] rounded-2xl shadow-xl border py-1.5 ${effectiveDark ? 'bg-[#0e1832] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                        style={{ left: Math.min(contextMenu.x, window.innerWidth - 200), top: Math.min(contextMenu.y, window.innerHeight - 100), boxShadow: '0 16px 40px rgba(0,0,0,0.35)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className={`px-3 py-2 mb-1 border-b ${effectiveDark ? 'border-white/10' : 'border-slate-100'}`}>
                            <p className={`text-[11px] font-semibold truncate max-w-[160px] ${textSec}`}>{contextMenu.trackTitle}</p>
                        </div>
                        <button
                            onClick={() => {
                                setRenamingTrack({ playlistId: contextMenu.playlistId, trackId: contextMenu.trackId, value: contextMenu.trackTitle });
                                setContextMenu(null);
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${effectiveDark ? 'hover:bg-white/[0.07]' : 'hover:bg-slate-50'}`}
                        >
                            <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                            </svg>
                            {isVietnamese ? 'Đổi tên' : 'Rename'}
                        </button>
                        <button
                            onClick={() => {
                                const pl = playlists.find(p => p.id === contextMenu.playlistId);
                                const track = pl?.tracks.find(t => t.id === contextMenu.trackId);
                                if (track) { setAddingTrack(track); setPickerOpen(true); }
                                setContextMenu(null);
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${effectiveDark ? 'hover:bg-white/[0.07]' : 'hover:bg-slate-50'}`}
                        >
                            <Plus className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                            {isVietnamese ? 'Thêm vào playlist khác' : 'Add to another playlist'}
                        </button>
                    </div>
                </div>,
                document.body,
            )}

            {/* ── Delete playlist confirmation dialog ───────────────────── */}
            {confirmDeleteId && typeof window !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setConfirmDeleteId(null)}
                >
                    <div
                        className={`w-full max-w-sm rounded-2xl shadow-2xl flex flex-col overflow-hidden ${effectiveDark ? 'bg-gray-900 ring-1 ring-white/10' : 'bg-white ring-1 ring-gray-200'}`}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className={`px-6 pt-6 pb-4 flex flex-col gap-2`}>
                            <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 mb-1" style={{ background: 'rgba(239,68,68,0.12)' }}>
                                <Trash2 className="w-5 h-5 text-rose-500" />
                            </div>
                            <p className={`text-base font-semibold ${effectiveDark ? 'text-white' : 'text-gray-900'}`}>
                                {isVietnamese ? 'Xóa playlist?' : 'Delete playlist?'}
                            </p>
                            <p className={`text-sm ${effectiveDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                {isVietnamese
                                    ? 'Hành động này không thể hoàn tác. Playlist sẽ bị xóa vĩnh viễn.'
                                    : 'This action cannot be undone. The playlist will be permanently deleted.'}
                            </p>
                            <p className={`text-xs font-semibold truncate ${effectiveDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                &ldquo;{playlists.find(p => p.id === confirmDeleteId)?.name ?? ''}&rdquo;
                            </p>
                        </div>
                        <div className={`flex gap-2 px-6 pb-6`}>
                            <button
                                onClick={() => setConfirmDeleteId(null)}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${effectiveDark ? 'bg-white/[0.08] text-white/80 hover:bg-white/[0.13]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                            >
                                {isVietnamese ? 'Hủy' : 'Cancel'}
                            </button>
                            <button
                                onClick={() => { void handleDeletePlaylist(confirmDeleteId); }}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all"
                            >
                                {isVietnamese ? 'Xóa' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );

    return createPortal(sidebarContent, document.body);
}
