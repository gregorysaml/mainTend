import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './navigation.css';
import { api } from './api/client.ts';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { navigationPages, pageFromHash, type Page } from './navigation/pages.ts';
import { FleetWorkspace } from './features/fleet/FleetWorkspace.tsx';
import { DemoNotice } from './components/layout/DemoNotice.tsx';
import { WarningsWorkspace } from './features/warnings/WarningsWorkspace.tsx';
const ImportData = lazy(() => import('./components/ImportData.tsx').then(module => ({ default: module.ImportData })));
import { AssessmentControls } from './components/AssessmentControls.tsx';
import { OwnerOverview } from './features/owner/OwnerOverview.tsx';
import { Header } from './components/layout/Header.tsx';
import { ThemeProvider } from './components/layout/ThemeProvider.tsx';
import { TooltipProvider } from './components/ui/tooltip.tsx';
import { AppearanceSettings } from './features/settings/AppearanceSettings.tsx';
const EvaluationCentre = lazy(() => import('./components/EvaluationCentre.tsx').then(module => ({ default: module.EvaluationCentre })));
import { MaintenanceWorkspace } from './features/maintenance/MaintenanceWorkspace.tsx';
import { ServiceWorkspace } from './features/maintenance/ServiceWorkspace.tsx';
const PredictiveWorkspace = lazy(() => import('./features/predictive/PredictiveWorkspace.tsx').then(module => ({ default: module.PredictiveWorkspace })));
import type { Dashboard, Profile } from '../../shared/types.ts';

import './styles/globals.css';
import './styles/design-system.css';
import './styles/workspaces.css';

function readPage(): Page {
  return pageFromHash(window.location.hash);
}

function App() {
  const [page, setPage] = useState<Page>(readPage);
  useEffect(() => { const navigate = () => { setPage(readPage()); window.scrollTo(0, 0); }; window.addEventListener('hashchange', navigate); return () => window.removeEventListener('hashchange', navigate); }, []);
  const initialProfile: Profile = new URLSearchParams(window.location.search).get('profile') === 'owner' ? 'owner' : 'fleet';
  const [profile, setProfile] = useState<Profile>(initialProfile);
  useEffect(() => { if (profile === 'owner' && page === 'vehicles') window.location.hash = 'overview'; }, [profile, page]);
  function changeProfile(next: Profile) {
    const url = new URL(window.location.href);
    url.searchParams.set('profile', next);
    if (next === 'owner' && page === 'vehicles') { url.hash = 'overview'; setPage('overview'); }
    window.history.replaceState(null, '', url);
    setProfile(next);
  }
  const currentProfile = useRef(profile);
  currentProfile.current = profile;
  const [state, setState] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const load = async () => { try { const dashboard = await api.dashboard(profile); if (currentProfile.current === profile) { setState(dashboard); setError(''); } } catch (e) { if (currentProfile.current === profile) setError(e instanceof Error ? e.message : 'Request failed'); } };
  useEffect(() => { load(); }, [profile]);
  const unreadCooling = state?.profile === profile ? [...(state.coolingRuns ?? []), ...(state.lubricationRuns ?? [])].filter(r => r.warningId && !r.notificationReadAt).length : 0;
  const pageTitle = page === 'predictive' ? 'Predictive maintenance' : page === 'settings' ? 'Settings & evidence' : page === 'evaluation' ? 'Test centre' : page === 'overview' ? (profile === 'fleet' ? 'Fleet overview' : 'My vehicle') : navigationPages(profile).find(item => item.id === page)?.label || 'My vehicle';
  return <div className="app-shell">
    <Sidebar page={page} profile={profile} />
    <div className="workspace">
      <Header title={pageTitle} page={page} profile={profile} notifications={unreadCooling} changeProfile={changeProfile} />
      <main>
        <DemoNotice page={page} />
        <Suspense fallback={<p role="status" className="muted">Loading this workspace…</p>}>
        {page === 'evaluation' && <EvaluationCentre key={`evaluation-${profile}`} profile={profile} />}
        {error && <p className="error">{error}</p>}
        {!error && (!state || state.profile !== profile) && <p className="muted" role="status">Loading vehicle records…</p>}
        {state && state.profile === profile && <>
          {page === 'service' && <ServiceWorkspace key={`service-${profile}`} dashboard={state} reload={load} />}
          {page === 'import' && <ImportData key={`import-${profile}`} vehicles={state.vehicles} reload={load} />}
          {page === 'predictive' && <PredictiveWorkspace key={`predictive-${profile}`} dashboard={state} reload={load} />}
          {page === 'overview' && profile === 'owner' && state.vehicles.map(vehicle => { const assessment = state.assessments.find(a => a.vehicleId === vehicle.id); return assessment ? <OwnerOverview key={vehicle.id} vehicle={vehicle} assessment={assessment} configuration={state.configuration} coolingRuns={state.coolingRuns ?? []} lubricationRuns={state.lubricationRuns ?? []} reload={load} /> : null; })}
          {profile === 'fleet' && (page === 'overview' || page === 'vehicles') && <FleetWorkspace key={page} dashboard={state} showMap={page === 'overview'} reload={load} />}
          {page === 'warnings' && <WarningsWorkspace key={profile} dashboard={state} reload={load} />}
          {page === 'maintenance' && <MaintenanceWorkspace key={`maintenance-${profile}`} dashboard={state} reload={load} />}
          {page === 'settings' && <><AppearanceSettings /><AssessmentControls key={`assessment-${profile}`} configuration={state.configuration} profile={profile} reload={load} /></>}
        </>}
        </Suspense>
      </main>
    </div>
  </div>;
}

const root=document.getElementById('root');
if(!root) throw new Error('Application root element was not found');
createRoot(root).render(<React.StrictMode><ThemeProvider><TooltipProvider delayDuration={250}><App /></TooltipProvider></ThemeProvider></React.StrictMode>);
