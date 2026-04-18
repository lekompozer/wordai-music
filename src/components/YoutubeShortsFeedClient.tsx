'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import YoutubeShortsPlayer from './YoutubeShortsPlayer';
import type { YTShortItem } from './YTShortItem';

export default function YoutubeShortsFeedClient() {
    const [lang, setLang] = useState<'vi' | 'en'>('vi');
    const [items, setItems] = useState<YTShortItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch
    useEffect(() => {
        let active = true;
        setLoading(true);
        fetch(`https://ai.wordai.pro/api/v1/trending/music?lang=${lang}&limit=40`)
            .then(res => res.json())
            .then(data => {
                if (!active) return;
                setItems(data.data || []);
                setLoading(false);
            })
            .catch(err => {
                if (!active) return;
                console.error(err);
                setLoading(false);
            });
        return () => { active = false; };
    }, [lang]);

    return (
        <div className="h-full w-full relative">
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
                items={items}
                loading={loading}
                loadingMore={false}
                onLoadMore={async () => { }}
            />
        </div>
    );
}
