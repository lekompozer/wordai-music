import type { Metadata } from 'next';
import './globals.css';
import { AppProviders } from '@/contexts/AppProviders';

export const metadata: Metadata = {
  title: 'WordAI Music — Free Unlimited Music Player, No Ads',
  description:
    'Turn any TikTok or YouTube video into MP3. Build unlimited playlists, seamless DJ-style playback with no awkward silence, background listening — no ads, no premium required.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-[#06060f] text-white antialiased" suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
