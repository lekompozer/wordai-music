/**
 * Music Channel Service
 * - Publish/unpublish personal playlists as public channels
 * - Like/unlike any channel (slug or UUID)
 * - Fetch liked counts for channels
 */

const WORKER_URL = 'https://db-wordai-community.hoangnguyen358888.workers.dev';

async function getToken(): Promise<string | null> {
    try {
        const { wordaiAuth } = await import('@/lib/wordai-firebase');
        await wordaiAuth.authStateReady();
        const user = wordaiAuth.currentUser;
        if (!user) return null;
        return user.getIdToken();
    } catch {
        return null;
    }
}

export interface PublicMusicChannel {
    id: string;         // playlist UUID
    userId: string;
    name: string;
    accent: string;
    description: string;
    genre: string;
    mood: string;
    tags: string;       // comma-separated
    createdAt: string;
    totalLikes: number;
    hasLiked: boolean;
}

export interface ChannelLikeStats {
    totalLikes: number;
    hasLiked: boolean;
}

export interface ChannelMeta {
    name?: string;
    accent?: string;
    description?: string;
    genre?: string;
    mood?: string;
    tags?: string;
}

/** Publish an existing playlist as a public community channel */
export async function publishPlaylistAsChannel(
    playlistId: string,
    meta: ChannelMeta = {},
): Promise<void> {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${WORKER_URL}/api/music/publish/${playlistId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'publish', ...meta }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        throw new Error(err.error || 'Failed to publish channel');
    }
}

/** Update metadata of an already-published channel */
export async function updateChannelMetadata(
    playlistId: string,
    meta: ChannelMeta,
): Promise<void> {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${WORKER_URL}/api/music/publish/${playlistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(meta),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        throw new Error(err.error || 'Failed to update channel metadata');
    }
}

/** Unpublish a previously published channel */
export async function unpublishChannel(playlistId: string): Promise<void> {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${WORKER_URL}/api/music/publish/${playlistId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'unpublish' }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        throw new Error(err.error || 'Failed to unpublish channel');
    }
}

/** Fetch all public community channels (sorted by likes) */
export async function getPublicMusicChannels(userId?: string): Promise<PublicMusicChannel[]> {
    const url = new URL(`${WORKER_URL}/api/music/public-channels`);
    if (userId) url.searchParams.set('userId', userId);
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const json = await res.json() as any;
    return json.data ?? [];
}

/** Toggle like/unlike on any channel ID (slug or UUID) */
export async function toggleChannelLike(
    channelId: string,
    currentlyLiked: boolean,
): Promise<{ totalLikes: number; hasLiked: boolean }> {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${WORKER_URL}/api/music/channel-like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channelId, action: currentlyLiked ? 'unlike' : 'like' }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        throw new Error(err.error || 'Failed to toggle like');
    }
    return res.json();
}

/** Batch fetch like stats for multiple channel IDs */
export async function getChannelStats(
    channelIds: string[],
    userId?: string,
): Promise<Record<string, ChannelLikeStats>> {
    if (!channelIds.length) return {};
    const url = new URL(`${WORKER_URL}/api/music/channel-stats`);
    url.searchParams.set('ids', channelIds.join(','));
    if (userId) url.searchParams.set('userId', userId);
    const res = await fetch(url.toString());
    if (!res.ok) return {};
    const json = await res.json() as any;
    return json.data ?? {};
}
