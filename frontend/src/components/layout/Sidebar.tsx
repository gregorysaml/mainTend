import { Brand } from '../Brand.tsx';
import { Icon, type IconName } from '../Icon.tsx';
import { navigationPages, type Page } from '../../navigation/pages.ts';
export function Sidebar({ page, profile }: { page: Page; profile: Profile }) {
  const items = navigationPages(profile);
  return <aside className="sidebar">
    <Brand />
    <nav className="side-nav" aria-label={profile === 'owner' ? 'My vehicle navigation' : 'Fleet navigation'} style={{ '--nav-count': items.length } as React.CSSProperties}>{items.map(item => <a key={item.id} href={`#${item.id}`} className={page === item.id ? 'selected' : ''} aria-current={page === item.id ? 'page' : undefined} aria-label={item.label}><span className="nav-icon"><Icon name={item.id as IconName} /></span><span>{item.label}</span></a>)}</nav>
    <div className="sidebar-utilities"><a href="#settings" className={`sidebar-settings ${page === 'settings' ? 'selected' : ''}`} aria-label="Settings & evidence" aria-current={page === 'settings' ? 'page' : undefined} title="Settings & evidence"><Icon name="settings" size={22} /></a></div>
  </aside>;
}
import type { Profile } from '../../../../shared/types.ts';
