/**
 * Audio blob cache — two tiers:
 *
 * 1. SESSION CACHE (in-memory Map): Remote R2 tracks.
 *    - Lives only for the current tab session; cleared automatically when the
 *      browser/tab is closed. No IndexedDB writes for remote tracks.
 *    - Within a session, scrolling back to an already-played track reuses the
 *      cached blob (no second network fetch).
 *
 * 2. INDEXEDDB (persistent): Locally-uploaded MP3 files only.
 *    - User-uploaded audio must survive page refreshes so the file isn't lost.
 */

// ─── Session-memory cache (remote R2 tracks) ─────────────────────────────────
const _sessionCache = new Map<string, Blob>();

/** Store a remote track blob for the current session only (in-memory). */
export function setSessionBlob(trackId: string, blob: Blob): void {
    _sessionCache.set(trackId, blob);
}

/** Retrieve a session-cached blob, or null if not yet fetched this session. */
export function getSessionBlob(trackId: string): Blob | null {
    return _sessionCache.get(trackId) ?? null;
}

const DB_NAME = 'wordai-audio-v1';
const STORE = 'blobs';

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
            _dbPromise = null;
            reject(req.error);
        };
    });
    return _dbPromise;
}

/** Store a Blob/File in IndexedDB, keyed by trackId. */
export async function cacheAudioBlob(trackId: string, blob: Blob): Promise<void> {
    try {
        const db = await openDB();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(blob, trackId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        // IndexedDB unavailable (e.g. private mode in some browsers) — silently ignore
    }
}

/** Retrieve a cached Blob, or null if not found. */
export async function getAudioBlob(trackId: string): Promise<Blob | null> {
    try {
        const db = await openDB();
        return new Promise<Blob | null>((resolve) => {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(trackId);
            req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

/**
 * Resolve a playback URL for a track.
 *
 * Behaviour:
 * - `local:*`            → look up blob in IndexedDB, return ObjectURL (or '' if missing)
 * - remote + shouldCache → check cache; on miss: fetch → store → return ObjectURL
 * - remote + !shouldCache → return rawUrl unchanged
 *
 * The caller is responsible for revoking the returned ObjectURL via
 * `URL.revokeObjectURL()` when the audio element is disposed.
 */
export async function resolveAudioUrl(
    trackId: string,
    rawUrl: string,
    shouldCache = false,
): Promise<string> {
    if (rawUrl.startsWith('local:')) {
        const blob = await getAudioBlob(trackId);
        return blob ? URL.createObjectURL(blob) : '';
    }

    if (!shouldCache) return rawUrl;

    const cached = await getAudioBlob(trackId);
    if (cached) return URL.createObjectURL(cached);

    // Fetch from network and cache
    try {
        const res = await fetch(rawUrl);
        if (res.ok) {
            const blob = await res.blob();
            await cacheAudioBlob(trackId, blob);
            return URL.createObjectURL(blob);
        }
    } catch {
        // Network error — fall back to raw URL so play still works
    }

    return rawUrl;
}

/** Extract the duration (in integer seconds) of an audio File/Blob. */
export function extractFileDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const audio = new Audio();
        const cleanup = () => { audio.src = ''; URL.revokeObjectURL(url); };
        audio.addEventListener('loadedmetadata', () => {
            cleanup();
            resolve(Math.round(audio.duration) || 0);
        }, { once: true });
        audio.addEventListener('error', () => {
            cleanup();
            resolve(0);
        }, { once: true });
        audio.src = url;
    });
}
