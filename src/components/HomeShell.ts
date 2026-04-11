import { createContext } from 'react';

/**
 * Stub for HomeSidebarCollapsedCtx — in the standalone Music app there is no
 * HomeShell sidebar, so this context always returns `false` (sidebar not collapsed).
 * MusicSidebar uses this value to compute its left offset.
 * In the Music app the main sidebar does not exist, so we treat it as always
 * collapsed (52px offset), which means the Music sidebar anchors at the very left.
 */
export const HomeSidebarCollapsedCtx = createContext<boolean>(true);
