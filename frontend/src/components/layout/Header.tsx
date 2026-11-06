import type { Profile } from '../../../../shared/types.ts';
import type { Page } from '../../navigation/pages.ts';
import { Brand } from '../Brand.tsx';
import { Icon } from '../Icon.tsx';
import { ThemeToggle } from '../ThemeToggle.tsx';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Tooltip } from '../ui/tooltip.tsx';
export function Header({ title, page, profile, notifications, changeProfile }: { title: string; page: Page; profile: Profile; notifications: number; changeProfile: (profile: Profile) => void }) {
  return <header className="topbar"><div className="mobile-brand"><Brand /></div><div className="page-heading"><p className="eyebrow">{profile === 'fleet' ? 'FLEET WORKSPACE' : 'PERSONAL WORKSPACE'}</p><h1>{title}</h1><p>{profile === 'fleet' ? 'A clearer view of every vehicle.' : 'Your vehicle. Your next step.'}</p></div><div className="header-tools">
    <Tooltip content="Predictive examples & notifications"><Button asChild variant="secondary" className={page === 'predictive' ? 'header-selected' : ''}><a href="#predictive" aria-label={`Predictive maintenance${notifications ? ` · ${notifications} unread notifications` : ''}`} aria-current={page === 'predictive' ? 'page' : undefined}><Icon name="activity" /><span className="header-predictive-label">Predictions</span>{notifications > 0 && <Badge tone="synthetic">{notifications}</Badge>}</a></Button></Tooltip>
    <ThemeToggle /><div className="demo-profile"><label>Demo profile<select value={profile} onChange={e => changeProfile(e.target.value as Profile)}><option value="fleet">Fleet coordinator</option><option value="owner">Private owner</option></select></label></div>
  </div></header>;
}
