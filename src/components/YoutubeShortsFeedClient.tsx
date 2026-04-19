'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import YoutubeShortsPlayer from './YoutubeShortsPlayer';
import type { YTShortItem } from './YTShortItem';

const API_BASE = 'https://ai.wordai.pro';
const LIMIT = 30;
// Fetch more when fewer than this many videos remain in the queue
const PREFETCH_THRESHOLD = 5;

// ─── localStorage helpers for seen video IDs ─────────────────────────────────

function seenKey(lang: string) {
    return `wordai-music-shorts-seen-${lang}`;
}

function loadSeenIds(lang: string): Set<string> {
    try {
        const raw = localStorage.getItem(seenKey(lang));
        if (!raw) return new Set();
        return new Set(JSON.parse(raw) as string[]);
    } catch {
        return new Set();
    }
}

function saveSeenIds(lang: string, ids: Set<string>) {
    try {
        // Cap at 2000 to avoid bloat — keep most recent
        const arr = Array.from(ids);
        const trimmed = arr.length > 2000 ? arr.slice(arr.length - 2000) : arr;
        localStorage.setItem(seenKey(lang), JSON.stringify(trimmed));
    } catch { /* storage full — ignore */ }
}

// ─── Component ────────────────────────────────────────────────────────────────

const SAVED_KEY = 'wordai-music-shorts-saved';

function loadSavedIds(): Set<string> {
    try { return new Set(JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]') as string[]); }
    catch { return new Set(); }
}
function persistSavedIds(ids: Set<string>) {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(Array.from(ids))); } catch { /* ignore */ }
}

export default function YoutubeShortsFeedClient() {
    const [lang, setLang] = useState<'vi' | 'en'>('vi');
    // Accumulated queue of unseen videos to display
    const [queue, setQueue] = useState<YTShortItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

    useEffect(() => { setSavedIds(loadSavedIds()); }, []);

    // Offset = number of videos already fetched from API (increments by LIMIT each call)
    const offsetRef = useRef(0);
    // Seen IDs for current lang — kept in ref so mark/check doesn't trigger re-renders
    const seenIdsRef = useRef<Set<string>>(new Set());
    // Prevent concurrent fetches
    const fetchingRef = useRef(false);

    // ── Reset when language changes ──────────────────────────────────────────
    useEffect(() => {
        seenIdsRef.current = loadSeenIds(lang);
        offsetRef.current = 0;
        setQueue([]);
        setLoading(true);
    }, [lang]);

    // ── Fetch next batch ─────────────────────────────────────────────────────
    const fetchMore = useCallback(async (isInitial = false) => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;
        if (isInitial) setLoading(true); else setLoadingMore(true);

        try {
            const url = `${API_BASE}/api/v1/trending/music?lang=${lang}&limit=${LIMIT}&offset=${offsetRef.current}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const fetched: YTShortItem[] = data.items || data.data || [];

            // Filter out already-seen videos
            let unseen = fetched.filter(v => !seenIdsRef.current.has(v.youtube_id));

            // Advance offset by full batch size (not just unseen count)
            offsetRef.current += LIMIT;

            // If ALL fetched videos are already seen → reset seen list so feed keeps cycling
            if (unseen.length === 0 && fetched.length > 0) {
                seenIdsRef.current.clear();
                try { localStorage.removeItem(seenKey(lang)); } catch { /* ignore */ }
                unseen = fetched;
            }

            if (unseen.length > 0) {
                setQueue(prev => {
                    // New unseen videos go to the FRONT, existing queue follows
                    return [...unseen, ...prev];
                });
            }
        } catch (err) {
            console.error('[YoutubeShortsFeed] fetch error:', err);
        } finally {
            fetchingRef.current = false;
            setLoading(false);
            setLoadingMore(false);
        }
    }, [lang]);

    // Initial fetch when lang resets queue
    useEffect(() => {
        if (queue.length === 0 && loading) {
            fetchMore(true);
        }
    }, [queue.length, loading, fetchMore]);

    // ── Mark video as seen when user watches it ──────────────────────────────
    const handleVideoWatched = useCallback((youtubeId: string) => {
        if (!youtubeId || seenIdsRef.current.has(youtubeId)) return;
        seenIdsRef.current.add(youtubeId);
        saveSeenIds(lang, seenIdsRef.current);
    }, [lang]);

    // ── Also mark seen when active index advances (scrolled past) ────────────
    // Kept as no-op — seen tracking is done only by handleVideoWatched (per active video)
    const handleActiveIndexChange = useCallback((_index: number) => { /* no-op */ }, []);

    // ── Load more when near the end ──────────────────────────────────────────
    const handleLoadMore = useCallback(async () => {
        await fetchMore(false);
    }, [fetchMore]);

    // ── Save / bookmark ───────────────────────────────────────────────────────
    const handleSave = useCallback((item: YTShortItem) => {
        setSavedIds(prev => {
            const next = new Set(prev);
            if (next.has(item.youtube_id)) { next.delete(item.youtube_id); }
            else { next.add(item.youtube_id); }
            persistSavedIds(next);
            return next;
        });
    }, []);

    return (
        <div className="h-full w-full relative">
            {/* Language tabs */}
            <div className="absolute top-[70px] right-4 z-50 flex gap-2">
                <button
                    onClick={() => setLang('vi')}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium backdrop-blur-md border ${lang === 'vi' ? 'bg-red-500/20 border-red-500/50 text-red-500' : 'bg-black/40 border-white/10 text-white hover:bg-black/60'}`}
                >
                    Vietnamese
                </button>
                <button
                    onClick={() => setLang('en')}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium backdrop-blur-md border ${lang === 'en' ? 'bg-red-500/20 border-red-500/50 text-red-500' : 'bg-black/40 border-white/10 text-white hover:bg-black/60'}`}
                >
                    English
                </button>
            </div>
            <YoutubeShortsPlayer
                items={queue}
                loading={loading}
                loadingMore={loadingMore}
                onLoadMore={handleLoadMore}
                onVideoWatched={handleVideoWatched}
                onActiveIndexChange={handleActiveIndexChange}
                onSave={handleSave}
                savedIds={savedIds}
                showControls={true}
            />
        </div>
    );
}
