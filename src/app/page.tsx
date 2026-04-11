import dynamic from 'next/dynamic';

// Music player is fully client-side — load dynamically to avoid SSR issues
const MusicApp = dynamic(() => import('@/components/MusicApp'), { ssr: false });

export default function HomePage() {
    return <MusicApp />;
}
