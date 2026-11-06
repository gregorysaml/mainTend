export type Theme = 'dark' | 'light';
export const themeStorageKey = 'maintend-theme';
export function readTheme(storage: Pick<Storage, 'getItem'>): Theme {
  try { return storage.getItem(themeStorageKey) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}
export function oppositeTheme(theme: Theme): Theme { return theme === 'dark' ? 'light' : 'dark'; }
