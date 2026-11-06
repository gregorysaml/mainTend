import { useTheme } from '../../components/layout/ThemeProvider.tsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card.tsx';
import { Icon } from '../../components/Icon.tsx';
export function AppearanceSettings() {
  const { theme, setTheme, saved } = useTheme();
  return <Card className="appearance-settings"><CardHeader><span className="section-kicker">MAKE IT YOURS</span><CardTitle>Appearance</CardTitle><CardDescription>A display preference for both profiles. Assessment settings stay unchanged.</CardDescription></CardHeader><CardContent>
    <fieldset className="theme-choices"><legend>Theme</legend>{(['light', 'dark'] as const).map(value => <label key={value} className={`theme-choice ${theme === value ? 'theme-selected' : ''}`}><input type="radio" name="appearance-theme" value={value} checked={theme === value} onChange={() => setTheme(value)} /><Icon name={value === 'light' ? 'sun' : 'moon'} size={24} /><span><strong>{value === 'light' ? 'Light' : 'Dark Tech'}</strong><small>{value === 'light' ? 'White surfaces. Clear contrast.' : 'Low-light canvas. Teal accents.'}</small></span></label>)}</fieldset>
    <p className="panel-note" role="status">{saved ? 'Applies immediately and is saved in this browser.' : 'Applies immediately. This browser cannot save the preference.'}</p>
  </CardContent></Card>;
}
