'use client';

/**
 * AppContext — stripped down version for WordAI Music app.
 * Only includes ThemeProvider and LanguageProvider (no E2EE, no Layout, no VersionUpdate).
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

interface ThemeContextType {
    isDark: boolean;
    toggleTheme: () => void;
    setIsDark: (value: boolean) => void;
    setTheme: (theme: 'light' | 'dark') => void;
}

interface LanguageContextType {
    isVietnamese: boolean;
    toggleLanguage: () => void;
    setIsVietnamese: (value: boolean) => void;
    getText: (key: string) => string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [isDark, setIsDark] = useState(true); // Music app defaults to dark

    useEffect(() => {
        const savedTheme = localStorage.getItem('wordai-music-theme');
        if (savedTheme) {
            setIsDark(savedTheme === 'dark');
        }
        // No saved theme → keep default true (dark) regardless of system preference
    }, []);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', isDark);
        localStorage.setItem('wordai-music-theme', isDark ? 'dark' : 'light');
    }, [isDark]);

    const toggleTheme = () => setIsDark(v => !v);
    const setTheme = (theme: 'light' | 'dark') => setIsDark(theme === 'dark');

    return (
        <ThemeContext.Provider value={{ isDark, toggleTheme, setIsDark, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [isVietnamese, setIsVietnamese] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('wordai-music-language');
        if (saved) {
            setIsVietnamese(saved === 'vi');
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('wordai-music-language', isVietnamese ? 'vi' : 'en');
    }, [isVietnamese]);

    const toggleLanguage = () => setIsVietnamese(v => !v);
    const getText = (key: string) => key; // No translation map needed — player uses inline t()

    return (
        <LanguageContext.Provider value={{ isVietnamese, toggleLanguage, setIsVietnamese, getText }}>
            {children}
        </LanguageContext.Provider>
    );
}

export const useTheme = () => {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
};

export const useLanguage = () => {
    const ctx = useContext(LanguageContext);
    if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
    return ctx;
};
