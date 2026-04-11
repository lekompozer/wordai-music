/**
 * Music API Service
 * Base: https://ai.wordai.pro/api/v1/music
 * Auth: Firebase ID Token (Bearer) required on all endpoints
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://ai.wordai.pro';
const MUSIC_BASE = `${API_BASE}/api/v1/music`;

async function getToken(): Promise<string> {
    const { wordaiAuth } = await import('@/lib/wordai-firebase');
    await wordaiAuth.authStateReady();
    const user = wordaiAuth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface YTSearchResult {
    youtube_id: string;
    title: string;
    artist: string;
    duration_sec: number;
    thumbnail: string;
    youtube_url: string;
}

export interface TrackMeta {
    track_id: string;
    title: string | null;
    artist: string | null;
    audio_url: string;
    cover_url: string | null;
    duration_sec: number;
    source: 'youtube' | 'tiktok';
    source_id: string;
    shazam_matched: boolean;
    from_cache: boolean;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Search YouTube — returns up to 10 results, no download.
 * Timing: ~2–4s.
 */
export async function searchYouTube(q: string, limit = 10): Promise<YTSearchResult[]> {
    const token = await getToken();
    const res = await fetch(`${MUSIC_BASE}/search?q=${encodeURIComponent(q)}&limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(err.detail || 'Search failed');
    }
    return res.json();
}

/**
 * Import YouTube URL → MP3.
 * Has MongoDB cache: if already imported by anyone, returns instantly (~10ms, from_cache: true).
 * First import: ~10–30s (yt-dlp + R2 upload).
 */
export async function importYouTube(url: string): Promise<TrackMeta> {
    const token = await getToken();
    const res = await fetch(`${MUSIC_BASE}/import-youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(err.detail || 'Import failed');
    }
    return res.json();
}

/**
 * Import TikTok URL → MP3 (always downloads, no cache).
 */
export async function importTikTok(url: string): Promise<TrackMeta> {
    const token = await getToken();
    const res = await fetch(`${MUSIC_BASE}/import-tiktok`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(err.detail || 'TikTok import failed');
    }
    return res.json();
}

// ─── TrackMeta → playlist track converter ────────────────────────────────────

export interface PlaylistTrack {
    id: string;
    title: string;
    artist: string;
    audioUrl: string;
    durationSec: number;
    source: 'youtube' | 'tiktok' | 'local' | 'facebook';
    thumbnailUrl?: string;
    youtubeId?: string;
    tiktokId?: string;
    facebookId?: string;
}

export function trackMetaToPlaylist(meta: TrackMeta): PlaylistTrack {
    return {
        id: meta.track_id,
        title: meta.title || 'Unknown',
        artist: meta.artist || 'Unknown',
        audioUrl: meta.audio_url,
        durationSec: meta.duration_sec,
        source: meta.source,
        thumbnailUrl: meta.cover_url ?? undefined,
    };
}

// ─── Play count tracking ──────────────────────────────────────────────────────

const WORKER_URL = 'https://db-wordai-community.hoangnguyen358888.workers.dev';

/**
 * Increment play count for a track. Fire-and-forget (no auth required).
 * Called when a track completes a full play (crossfade trigger or ended event).
 */
export function recordTrackPlay(trackId: string): void {
    if (!trackId) return;
    // fire-and-forget — never throws, never blocks the player
    fetch(`${WORKER_URL}/api/music/track-played`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId }),
    }).catch(() => { /* silently ignore */ });
}

/**
 * Batch-fetch play counts for a list of track IDs.
 * Returns a map of { trackId → playCount }.
 */
export async function fetchTrackPlays(trackIds: string[]): Promise<Record<string, number>> {
    if (!trackIds.length) return {};
    const ids = trackIds.slice(0, 100).join(',');
    try {
        const res = await fetch(`${WORKER_URL}/api/music/track-plays?ids=${encodeURIComponent(ids)}`);
        if (!res.ok) return {};
        const json = await res.json() as { data: Record<string, number> };
        return json.data ?? {};
    } catch {
        return {};
    }
}
