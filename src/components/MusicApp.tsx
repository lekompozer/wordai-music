'use client';

/**
 * MusicApp — top-level shell for WordAI Music desktop app.
 * Replaces HomeShell from the main wordai app.
 * Renders: MusicHeader (draggable title bar + Login) + MusicPlayerClientRouter.
 */

import { useState, useEffect } from 'react';
import MusicHeader from './MusicHeader';

// Detect mobile vs desktop to route to correct player
function detectMobile(): boolean {
    return (
        navigator.maxTouchPoints > 1 ||
        /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    );
}

export default function MusicApp() {
    const [isMobile, setIsMobile] = useState<boolean | null>(null);

    useEffect(() => {
        setIsMobile(detectMobile());
    }, []);

    if (isMobile === null) return null;

    // Dynamic import to avoid SSR issues
    const PlayerComponent = isMobile
        ? require('./MusicPlayerMobile').default
        : require('./MusicPlayerClient').default;

    return (
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#06060f]">
            <MusicHeader />
            <div className="flex-1 overflow-hidden relative">
                <PlayerComponent />
            </div>
        </div>
    );
}
