import type { Profile } from '../../../shared/types.ts';

export const pages = [
  { id: 'overview', label: 'Overview', icon: '⌂' },
  { id: 'vehicles', label: 'Vehicles', icon: '◇' },
  { id: 'warnings', label: 'Warnings', icon: '⚠' },
  { id: 'maintenance', label: 'Maintenance', icon: '✓' },
  { id: 'service', label: 'Capabilities & care', icon: '◇' },
  { id: 'import', label: 'Import data', icon: '↥' }
] as const;
export type Page = typeof pages[number]['id'] | 'evaluation' | 'settings' | 'predictive' | 'service';

export function pageFromHash(hash: string): Page {
  const id = hash.replace(/^#/, '').split('?')[0];
  if (id === 'evaluation' || id === 'settings' || id === 'predictive' || id === 'service') return id;
  return pages.find(item => item.id === id)?.id ?? 'overview';
}

export function navigationPages(profile: Profile): { id: Page; label: string; icon: string }[] {
  return profile === 'fleet' ? [...pages] : [
    { id: 'overview', label: 'My vehicle', icon: '⌂' },
    { id: 'warnings', label: 'Warnings', icon: '⚠' },
    { id: 'maintenance', label: 'Maintenance', icon: '✓' },
    { id: 'service', label: 'Capabilities & care', icon: '◇' },
    { id: 'import', label: 'Add readings', icon: '↥' }
  ];
}
