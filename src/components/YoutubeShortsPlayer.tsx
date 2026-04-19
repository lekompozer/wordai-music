'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import YoutubeShortCard from './YoutubeShortCard';
import type { YTShortItem } from "./YTShortItem";

// ─── Skeleton ────────────────────────────────────────────────────────────────────

function ShortSkeleton() {
    return (
        <div className="w-full h-full bg-gray-900 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gray-700 animate-pulse" />
                <div className="w-32 h-3 bg-gray-700 rounded animate-pulse" />
                <div className="w-24 h-2 bg-gray-800 rounded animate-pulse" />
            </div>
        </div>
    );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface YoutubeShortsPlayerProps {
    items: YTShortItem[];
    loading: boolean;
    loadingMore: boolean;
    onLoadMore: () => void;
    /** Overlay injected at the top — the tab bar + filter badges */
    headerOverlay?: React.ReactNode;
    /** Scroll to this index on first render (restores last watched position) */
    initialIndex?: number;
    /** Called whenever the visible video changes */
    onActiveIndexChange?: (index: number) => void;
    /** Called after user watches a video for >= 5 seconds */
    onVideoWatched?: (youtubeId: string) => void;
    /** Show YouTube seek bar / controls (for long-form videos). Default: false (Shorts style) */
    showControls?: boolean;
    /** Called when user taps the save/bookmark button */
    onSave?: (item: YTShortItem) => void;
    /** Set of saved youtube_ids for bookmark state display */
    savedIds?: Set<string>;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Vertical snap-scroll YouTube Shorts player using VIDEO POOLING pattern.
 *
 * ONE iframe is created on mount and never destroyed.
 * When activeIndex changes → postMessage `loadVideoById` into the same iframe.
 * This is identical to how /music works and eliminates the 10-15s cold-start
 * delay that occurs when a new iframe is created per video.
 *
 * The iframe is positioned absolutely inside the snap container at
 * `top: activeIndex * 100svh` so it always covers the active slide.
 * Slide sections only render thumbnail + UI overlay (no iframes).
 */

// Module-level mute flag — persists across component mounts / tab switches
let globalMuted = true;

export default function YoutubeShortsPlayer({
    items,
    loading,
    loadingMore,
    onLoadMore,
    headerOverlay,
    initialIndex = 0,
    onActiveIndexChange,
    onVideoWatched,
    showControls = false,
    onSave,
    savedIds,
}: YoutubeShortsPlayerProps) {
    const [activeIndex, setActiveIndex] = useState(initialIndex);
    const [isMuted, setIsMuted] = useState(globalMuted);

    // ── Refs ───────────────────────────────────────────────────────────────────
    const snapRef = useRef<HTMLDivElement>(null);
    const sectionRefs = useRef<(HTMLElement | null)[]>([]);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const pooledIframeRef = useRef<HTMLIFrameElement | null>(null);
    const iframeReadyRef = useRef(false);
    const isMutedRef = useRef(globalMuted);
    const activeIndexRef = useRef(activeIndex);
    const itemsRef = useRef(items);
    const watchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const initialScrollDone = useRef(false);

    // Keep refs in sync
    useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
    useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
    useEffect(() => { itemsRef.current = items; }, [items]);

    // ── postMessage helper ───────────────────────────────────────────────────
    const sendCmd = useCallback((func: string, args: unknown[] = []) => {
        try {
            pooledIframeRef.current?.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func, args }),
                '*',
            );
        } catch { }
    }, []);

    // ── iframe onLoad ──────────────────────────────────────────────────────
    const handleIframeLoad = useCallback(() => {
        iframeReadyRef.current = true;
        const win = pooledIframeRef.current?.contentWindow;
        if (!win) return;
        try {
            // Register for player state events (needed for ended detection)
            win.postMessage(JSON.stringify({ event: 'listening', id: 1 }), '*');
        } catch { }
        // If scroll was restored to a non-zero position, the active video
        // may differ from the iframe’s initial src — load it now.
        const currentItem = itemsRef.current[activeIndexRef.current];
        if (currentItem) {
            sendCmd('loadVideoById', [currentItem.youtube_id, 0]);
        } else {
            sendCmd('playVideo');
        }
        sendCmd(isMutedRef.current ? 'mute' : 'unMute');
    }, [sendCmd]);

    // ── activeIndex change → swap video in the same iframe ─────────────────
    useEffect(() => {
        if (!iframeReadyRef.current) return;
        const item = items[activeIndex];
        if (!item) return;
        sendCmd('loadVideoById', [item.youtube_id, 0]);
        sendCmd(isMutedRef.current ? 'mute' : 'unMute');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeIndex, items, sendCmd]);

    // ── mute change ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!iframeReadyRef.current) return;
        sendCmd(isMuted ? 'mute' : 'unMute');
    }, [isMuted, sendCmd]);

    // ── Ended detection via postMessage ────────────────────────────────
    const handleVideoEnded = useCallback(() => {
        const nextIndex = activeIndexRef.current + 1;
        const nextEl = sectionRefs.current[nextIndex];
        if (nextEl && snapRef.current) {
            nextEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, []);

    useEffect(() => {
        const handler = (e: MessageEvent) => {
            if (e.source !== pooledIframeRef.current?.contentWindow) return;
            try {
                const data = JSON.parse(e.data as string);
                if (
                    (data.event === 'infoDelivery' && data.info?.playerState === 0) ||
                    (data.event === 'onStateChange' && data.info === 0)
                ) {
                    handleVideoEnded();
                }
            } catch { }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [handleVideoEnded]);

    // ── iOS Safari workaround: touchend is a user gesture → playVideo ──────
    useEffect(() => {
        const el = snapRef.current;
        if (!el) return;
        const handler = () => sendCmd('playVideo');
        el.addEventListener('touchend', handler, { passive: true });
        return () => el.removeEventListener('touchend', handler);
    }, [sendCmd]);

    // ── Mute toggle ────────────────────────────────────────────────────────
    const handleToggleMute = useCallback(() => {
        globalMuted = !globalMuted;
        setIsMuted(globalMuted);
    }, []);

    // ── Active card detection via scroll position (like /music) ──────────
    const handleScroll = useCallback(() => {
        const container = snapRef.current;
        if (!container) return;
        const idx = Math.round(container.scrollTop / container.clientHeight);
        if (idx !== activeIndexRef.current && idx >= 0 && idx < itemsRef.current.length) {
            setActiveIndex(idx);
        }
    }, []);

    // ── Infinite scroll trigger: fire when 3 items from end ─────────────
    useEffect(() => {
        if (loading || loadingMore || items.length === 0) return;
        if (activeIndex >= items.length - 3) onLoadMore();
    }, [activeIndex, items.length, loading, loadingMore, onLoadMore]);

    // ── Scroll restore on initial load ────────────────────────────────
    useEffect(() => {
        if (items.length === 0) { initialScrollDone.current = false; return; }
    }, [items.length]);

    useEffect(() => {
        if (loading || initialIndex <= 0 || initialScrollDone.current) return;
        if (!snapRef.current) return;
        const t = setTimeout(() => {
            if (snapRef.current && !initialScrollDone.current) {
                snapRef.current.scrollTop = initialIndex * snapRef.current.clientHeight;
                initialScrollDone.current = true;
            }
        }, 50);
        return () => clearTimeout(t);
    }, [loading, initialIndex]);

    // ── Watched / position tracking ──────────────────────────────────
    useEffect(() => {
        if (watchTimerRef.current) clearTimeout(watchTimerRef.current);
        onActiveIndexChange?.(activeIndex);
        const item = items[activeIndex];
        // Mark as seen immediately when video becomes active — don't wait for timer.
        // Dependent on `items` so it correctly fires for the 0th index when items are fully loaded.
        if (item && onVideoWatched) {
            onVideoWatched(item.youtube_id);
        }
        return () => { if (watchTimerRef.current) clearTimeout(watchTimerRef.current); };
    }, [activeIndex, items, onActiveIndexChange, onVideoWatched]);

    // ── Build origin for iframe src ───────────────────────────────────
    const origin = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : '';
    const firstItem = items[initialIndex] ?? items[0];

    // ── Desktop prev / next ────────────────────────────────────────────
    const handlePrev = useCallback(() => {
        const prev = activeIndexRef.current - 1;
        if (prev < 0) return;
        const el = sectionRefs.current[prev];
        if (el && snapRef.current) snapRef.current.scrollTop = prev * snapRef.current.clientHeight;
    }, []);

    const handleNext = useCallback(() => {
        const next = activeIndexRef.current + 1;
        const el = sectionRefs.current[next];
        if (el && snapRef.current) snapRef.current.scrollTop = next * snapRef.current.clientHeight;
    }, []);

    // ── Render ──────────────────────────────────────────────────────────────────
    return (
        <div className="relative h-full min-h-0 bg-black">
            {headerOverlay}



            {/* Desktop prev / next buttons — right side, vertically centered */}
            <div className="hidden lg:flex absolute right-4 top-1/2 -translate-y-1/2 flex-col gap-2 z-30">
                <button
                    onClick={handlePrev}
                    disabled={activeIndex === 0}
                    className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors disabled:opacity-30"
                    aria-label="Previous video"
                >
                    <ChevronUp className="w-5 h-5" />
                </button>
                <button
                    onClick={handleNext}
                    disabled={activeIndex >= items.length - 1}
                    className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors disabled:opacity-30"
                    aria-label="Next video"
                >
                    <ChevronDown className="w-5 h-5" />
                </button>
            </div>

            <div
                ref={snapRef}
                onScroll={handleScroll}
                className="h-full w-full relative overflow-y-scroll overflow-x-hidden snap-y snap-mandatory
                           [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
                {/* Loading skeleton */}
                {loading && (
                    <section className="h-full w-full flex-shrink-0 snap-start">
                        <ShortSkeleton />
                    </section>
                )}

                {/* Empty state */}
                {!loading && items.length === 0 && (
                    <section className="h-full w-full flex-shrink-0 snap-start flex items-center justify-center">
                        <div className="text-center px-8">
                            <p className="text-4xl mb-3">📭</p>
                            <p className="text-white/60 text-sm">Không có nội dung. Thử lại nhé.</p>
                        </div>
                    </section>
                )}

                {/* Slide sections — thumbnail + UI only, NO iframes here */}
                {!loading && items.map((item, i) => (
                    <section
                        key={`${item.youtube_id}-${i}`}
                        ref={el => { sectionRefs.current[i] = el; }}
                        className="h-full w-full flex-shrink-0 snap-start relative overflow-hidden"
                    >
                        <YoutubeShortCard
                            item={item}
                            isActive={i === activeIndex}
                            isMuted={isMuted}
                            onToggleMute={handleToggleMute}
                            onSave={onSave ? () => onSave(item) : undefined}
                            isSaved={savedIds?.has(item.youtube_id)}
                        />
                    </section>
                ))}

                {/*
                  * POOLED IFRAME — inside the scroll container, same pattern as /music.
                  * Positioned at top: activeIndex*100% so it tracks the active slide
                  * as the container snaps. Height is calc(100% - 160px) to leave the
                  * bottom title/controls strip untouched — iOS detects swipe from there.
                  */}
                {!loading && firstItem && (
                    <div
                        className="absolute left-0 right-0 z-10"
                        style={{ top: `${activeIndex * 100}%`, height: '100%' }}
                    >
                        <iframe
                            ref={pooledIframeRef}
                            src={`https://www.youtube-nocookie.com/embed/${firstItem.youtube_id}?autoplay=1&mute=1&controls=${showControls ? 1 : 0}&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${origin}`}
                            className="w-full h-full border-0"
                            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                            allowFullScreen
                            onLoad={handleIframeLoad}
                        />
                        {/* Gradient overlay — only shown when controls are hidden (Shorts style) */}
                        {!showControls && (
                            <div className="absolute bottom-0 inset-x-0 h-[160px] bg-gradient-to-t from-black via-black/70 to-transparent pointer-events-none z-10" />
                        )}
                    </div>
                )}

                {/* Load more skeleton */}
                {loadingMore && (
                    <section className="h-full w-full flex-shrink-0 snap-start">
                        <ShortSkeleton />
                    </section>
                )}

                {/* Infinite scroll trigger */}
            </div>
        </div>
    );
}
