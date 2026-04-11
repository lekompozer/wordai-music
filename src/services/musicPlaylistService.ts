import type { PlaylistTrack } from '@/services/musicService';

const WORKER_URL = 'https://db-wordai-community.hoangnguyen358888.workers.dev';
export const MUSIC_PLAYLISTS_UPDATED_EVENT = 'music-playlists-updated';

async function getToken(): Promise<string> {
    const { wordaiAuth } = await import('@/lib/wordai-firebase');
    // authStateReady() resolves once Firebase has restored the session from
    // localStorage/IndexedDB. Without this, currentUser can still be null on
    // the first call even though the user IS logged in.
    await wordaiAuth.authStateReady();
    const user = wordaiAuth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken();
}

export interface MusicPlaylistTrack extends PlaylistTrack {
    createdAt?: string;
}

export interface MusicPlaylist {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    tracks: MusicPlaylistTrack[];
}

function emitMusicPlaylistsUpdated() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(MUSIC_PLAYLISTS_UPDATED_EVENT));
    }
}

export async function getMusicPlaylists(): Promise<MusicPlaylist[]> {
    const token = await getToken();
    const res = await fetch(`${WORKER_URL}/api/music/playlists`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || 'Failed to load playlists');
    }
    const data = await res.json() as { data?: MusicPlaylist[] };
    return data.data ?? [];
}

export async function createMusicPlaylist(name: string): Promise<MusicPlaylist> {
    const token = await getToken();
    const res = await fetch(`${WORKER_URL}/api/music/playlists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || 'Failed to create playlist');
    }
    const data = await res.json() as { data: MusicPlaylist };
    emitMusicPlaylistsUpdated();
    return data.data;
}

export async function deleteMusicPlaylist(playlistId: string): Promise<void> {
    const token = await getToken();
    const res = await fetch(`${WORKER_URL}/api/music/playlists/${playlistId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || 'Failed to delete playlist');
    }
    emitMusicPlaylistsUpdated();
}

export async function addTrackToMusicPlaylist(playlistId: string, track: PlaylistTrack, silent = false): Promise<void> {
    const token = await getToken();
    const res = await fetch(`${WORKER_URL}/api/music/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ track }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || 'Failed to add track to playlist');
    }
    if (!silent) emitMusicPlaylistsUpdated();
}

export async function removeTrackFromMusicPlaylist(playlistId: string, trackId: string): Promise<void> {
    const token = await getToken();
    const res = await fetch(`${WORKER_URL}/api/music/playlists/${playlistId}/tracks/${encodeURIComponent(trackId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || 'Failed to remove track from playlist');
    }
    emitMusicPlaylistsUpdated();
}

export async function renamePlaylistTrack(playlistId: string, trackId: string, newTitle: string): Promise<void> {
    const token = await getToken();
    const res = await fetch(`${WORKER_URL}/api/music/playlists/${playlistId}/tracks/${encodeURIComponent(trackId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newTitle.trim() }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || 'Failed to rename track');
    }
    emitMusicPlaylistsUpdated();
}