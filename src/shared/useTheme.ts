import { useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'fisioself-theme';

const applyTheme = (theme: Theme): void => {
  document.documentElement.setAttribute('data-theme', theme);
};

const getInitialTheme = (): Theme => {
  const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (saved === 'light' || saved === 'dark') {
    applyTheme(saved);
    return saved;
  }
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const initial: Theme = prefersDark ? 'dark' : 'light';
  applyTheme(initial);
  return initial;
};

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  return { theme, toggleTheme };
}
