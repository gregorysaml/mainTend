import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { readTheme, themeStorageKey, type Theme } from '../../utils/theme.ts';
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void; saved: boolean } | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => { try { return readTheme(window.localStorage); } catch { return 'light'; } });
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1119' : '#f8fafc');
    try { window.localStorage.setItem(themeStorageKey, theme); setSaved(true); } catch { setSaved(false); }
  }, [theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === themeStorageKey || event.key === null) { try { setTheme(readTheme(window.localStorage)); } catch { /* Keep the active theme if storage is blocked. */ } } };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  return <ThemeContext.Provider value={{ theme, setTheme, saved }}>{children}</ThemeContext.Provider>;
}
export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error('ThemeProvider is required'); return value; }
