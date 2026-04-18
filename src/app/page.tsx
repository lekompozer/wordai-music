'use client';

import dynamic from 'next/dynamic';
import React from 'react';

// Music player is fully client-side — load dynamically to avoid SSR issues
const MusicApp = dynamic(() => import('@/components/MusicApp'), { ssr: false });

class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { error: string | null }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(e: unknown) {
        return { error: String(e) };
    }
    render() {
        if (this.state.error) {
            return (
                <div style={{ background: '#000', color: '#ff4444', padding: 24, fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap', position: 'fixed', inset: 0, zIndex: 99999, overflow: 'auto' }}>
                    <b>🔴 RUNTIME CRASH (DEBUG)</b>{'\n\n'}{this.state.error}
                </div>
            );
        }
        return this.props.children;
    }
}

export default function HomePage() {
    return <ErrorBoundary><MusicApp /></ErrorBoundary>;
}
