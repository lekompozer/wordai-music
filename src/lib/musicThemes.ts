/**
 * Shared 12 accent themes used by the music card visualizer AND the Sound Deck sidebar.
 * These match the TRACK_VISUAL_THEMES array in MusicPlayerClient.tsx exactly.
 */

export const MUSIC_ACCENT_THEMES = [
    { accent: '#4f46e5', r: 79, g: 70, b: 229, name: 'Indigo' },
    { accent: '#2563eb', r: 37, g: 99, b: 235, name: 'Blue' },
    { accent: '#7c3aed', r: 124, g: 58, b: 237, name: 'Violet' },
    { accent: '#0f766e', r: 15, g: 118, b: 110, name: 'Teal' },
    { accent: '#1d4ed8', r: 29, g: 78, b: 216, name: 'Navy' },
    { accent: '#e11d48', r: 225, g: 29, b: 72, name: 'Rose' },
    { accent: '#ea580c', r: 234, g: 88, b: 12, name: 'Orange' },
    { accent: '#16a34a', r: 22, g: 163, b: 74, name: 'Green' },
    { accent: '#0891b2', r: 8, g: 145, b: 178, name: 'Cyan' },
    { accent: '#a21caf', r: 162, g: 28, b: 175, name: 'Fuchsia' },
    { accent: '#6d28d9', r: 109, g: 40, b: 217, name: 'Grape' },
    { accent: '#475569', r: 71, g: 85, b: 105, name: 'Slate' },
] as const;

export type MusicAccentTheme = (typeof MUSIC_ACCENT_THEMES)[number];

/** Build the sidebar panel gradient for a given accent index (0-11). */
export function buildSidebarGradient(idx: number): string {
    const { r, g, b } = MUSIC_ACCENT_THEMES[idx % MUSIC_ACCENT_THEMES.length];
    return [
        `radial-gradient(circle at top left, rgba(${r},${g},${b},0.28), transparent 36%)`,
        `radial-gradient(circle at bottom right, rgba(${r},${g},${b},0.14), transparent 34%)`,
        'linear-gradient(180deg, rgba(8,12,28,0.98) 0%, rgba(6,10,22,0.98) 100%)',
    ].join(', ');
}
