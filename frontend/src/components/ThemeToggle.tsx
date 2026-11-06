import { Icon } from './Icon.tsx';
import { oppositeTheme } from '../utils/theme.ts';
import { useTheme } from './layout/ThemeProvider.tsx';
import { Button } from './ui/button.tsx';
import { Tooltip } from './ui/tooltip.tsx';
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return <Tooltip content={`Switch to ${oppositeTheme(theme)} theme`}><Button type="button" variant="secondary" size="icon" className="theme-toggle" aria-label={`Switch to ${oppositeTheme(theme)} theme`} onClick={() => setTheme(oppositeTheme(theme))}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></Button></Tooltip>;
}
