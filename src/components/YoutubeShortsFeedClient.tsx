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

export default function YoutubeShortsFeedClient() {
    const [lang, setLang] = useState<'vi' | 'en'>('vi');
    // Accumulated queue of unseen videos to display
    const [queue, setQueue] = useState<YTShortItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

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
            const unseen = fetched.filter(v => !seenIdsRef.current.has(v.youtube_id));

            // Advance offset by full batch size (not just unseen count)
            offsetRef.current += LIMIT;

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
    const handleActiveIndexChange = useCallback((index: number) => {
        // Mark all videos up to (but not including) current index as seen
        setQueue(prev => {
            for (let i = 0; i < index && i < prev.length; i++) {
                const id = prev[i].youtube_id;
                if (!seenIdsRef.current.has(id)) {
                    seenIdsRef.current.add(id);
                }
            }
            saveSeenIds(lang, seenIdsRef.current);
            return prev; // no structural change needed
        });
    }, [lang]);

    // ── Load more when near the end ──────────────────────────────────────────
    const handleLoadMore = useCallback(async () => {
        await fetchMore(false);
    }, [fetchMore]);

    return (
        <div className="h-full w-full relative">
            {/* Language tabs */}
            <div className="absolute top-4 left-4 z-50 flex gap-2">
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
            />
        </div>
    );
}
