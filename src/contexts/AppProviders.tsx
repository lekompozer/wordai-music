'use client';

/**
 * AppProviders — combines all providers for WordAI Music app.
 */

import { ThemeProvider, LanguageProvider } from './AppContext';
import { WordaiAuthProvider } from './WordaiAuthContext';

export function AppProviders({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider>
            <LanguageProvider>
                <WordaiAuthProvider>{children}</WordaiAuthProvider>
            </LanguageProvider>
        </ThemeProvider>
    );
}
