/**
 * localLibrary.ts — manage local audio files on disk for the desktop app.
 *
 * Strategy:
 *  - Use @tauri-apps/plugin-dialog to open file/folder picker (user gesture).
 *  - Use convertFileSrc() to turn a local path into an asset:// URL playable
 *    directly by WKWebView (no copying to IndexedDB, no size limit).
 *  - Store only metadata (title, artist, path, duration) in localStorage.
 *  - Tracks have source='local' and audioUrl='asset://localhost/...'
 */

export interface LocalTrack {
    id: string;
    title: string;
    artist: string;
    filePath: string;        // original absolute path for display
    audioUrl: string;        // asset:// URL for playback
    durationSec: number;
    isVideo: boolean;        // true for mp4/mov/webm/mkv/m4v files
    addedAt: number;
}

export interface LocalPlaylist {
    id: string;
    name: string;
    tracks: LocalTrack[];
    createdAt: number;
}

const LS_KEY = 'wynai_local_library';

export function getLocalPlaylists(): LocalPlaylist[] {
    try {
        const raw = localStorage.getItem(LS_KEY);
        const playlists = raw ? (JSON.parse(raw) as LocalPlaylist[]) : [];
        // Migrate: set isVideo from file extension for tracks that pre-date the isVideo field
        const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'mkv', 'm4v'];
        let dirty = false;
        for (const pl of playlists) {
            for (const t of pl.tracks) {
                if (t.isVideo === undefined) {
                    t.isVideo = VIDEO_EXTS.some(ext => (t.audioUrl || t.filePath || '').toLowerCase().endsWith(`.${ext}`));
                    dirty = true;
                }
            }
        }
        if (dirty) localStorage.setItem(LS_KEY, JSON.stringify(playlists));
        return playlists;
    } catch {
        return [];
    }
}

export function saveLocalPlaylists(playlists: LocalPlaylist[]): void {
    localStorage.setItem(LS_KEY, JSON.stringify(playlists));
}

export function deleteLocalPlaylist(id: string): void {
    saveLocalPlaylists(getLocalPlaylists().filter(p => p.id !== id));
}

/** Get duration of an asset:// URL by loading it in a temporary Audio element. */
async function getAssetDuration(assetUrl: string): Promise<number> {
    return new Promise(resolve => {
        const a = new Audio();
        a.preload = 'metadata';
        a.src = assetUrl;
        const done = (val: number) => {
            a.src = '';
            resolve(val);
        };
        a.onloadedmetadata = () => done(a.duration || 0);
        a.onerror = () => done(0);
        setTimeout(() => done(0), 4000);
    });
}

/** Convert a file name to a nice title (strip extension, replace dashes/underscores). */
function nameToTitle(fileName: string): string {
    return fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim();
}

/** Convert a file path to an asset:// URL using @tauri-apps/api/core. */
async function toAssetUrl(filePath: string): Promise<string> {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    return convertFileSrc(filePath);
}

/**
 * Open a file picker and return LocalTracks for selected audio files.
 * Does NOT save to localStorage — caller decides which playlist to put them in.
 */
export async function pickAudioFiles(): Promise<LocalTrack[]> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const result = await open({
        multiple: true,
        filters: [
            { name: 'Audio & Video', extensions: ['mp3', 'flac', 'm4a', 'wav', 'ogg', 'aac', 'opus', 'wma', 'aiff', 'mp4', 'mov', 'webm', 'mkv', 'm4v'] },
        ],
    });
    if (!result) return [];
    const paths = Array.isArray(result) ? result : [result];
    return buildTracksFromPaths(paths);
}

/**
 * Open a folder picker and return LocalTracks for all audio files in that folder.
 * Creates a playlist named after the folder.
 */
export async function pickAudioFolder(): Promise<{ folderName: string; tracks: LocalTrack[] } | null> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const folder = await open({ directory: true });
    if (!folder || Array.isArray(folder)) return null;

    const { invoke } = await import('@tauri-apps/api/core');
    const files = await invoke<{ path: string; name: string }[]>('read_audio_files_in_dir', { dirPath: folder });
    if (!files.length) return null;

    const folderName = folder.split(/[\\/]/).filter(Boolean).pop() ?? 'Local Folder';
    const tracks = await buildTracksFromPaths(files.map(f => f.path));
    return { folderName, tracks };
}

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv', 'm4v'];

async function buildTracksFromPaths(paths: string[]): Promise<LocalTrack[]> {
    // Build asset URLs + durations in parallel to avoid serial 4s-per-file timeout
    const results = await Promise.all(paths.map(async (filePath) => {
        const fileName = filePath.split(/[\/]/).pop() ?? filePath;
        const ext = (fileName.split('.').pop() ?? '').toLowerCase();
        const isVideo = VIDEO_EXTENSIONS.includes(ext);
        const assetUrl = await toAssetUrl(filePath);
        // Skip duration probe for video files — they can take longer and we don't display it
        const durationSec = isVideo ? 0 : await getAssetDuration(assetUrl);
        return {
            id: `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            title: nameToTitle(fileName),
            artist: '',
            filePath,
            audioUrl: assetUrl,
            durationSec,
            isVideo,
            addedAt: Date.now(),
        };
    }));
    return results;
}
