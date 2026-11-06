import { useEffect, useState } from 'react';
import type { Dashboard } from '../../../../shared/types.ts';
import type { Reload } from '../maintenance/ActionForms.tsx';
import { CoolingWorkspace } from './CoolingWorkspace.tsx';
import { LubricationWorkspace } from './LubricationWorkspace.tsx';
import type { PredictiveSystem } from './presentation.ts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs.tsx';
import {AnnualHistoryWorkspace} from './AnnualHistoryWorkspace.tsx';

type WorkspaceSystem=PredictiveSystem|'annual';
function readSystem(): WorkspaceSystem { const system=new URLSearchParams(window.location.hash.split('?')[1]).get('system');return system==='cooling'||system==='lubrication'?system:'annual'; }
export function PredictiveWorkspace({ dashboard, reload }: { dashboard: Dashboard; reload: Reload }) {
  const [system, setSystem] = useState(readSystem);
  useEffect(() => { const navigate = () => setSystem(readSystem()); window.addEventListener('hashchange', navigate); return () => window.removeEventListener('hashchange', navigate); }, []);
  const systems = [{ id:'annual',label:'12-month history' },{ id: 'cooling', label: '1 · Cooling system' }, { id: 'lubrication', label: '2 · Engine lubrication' }] as const;
  function choose(value: WorkspaceSystem) { setSystem(value); window.location.hash = `predictive?system=${value}`; }
  return <Tabs className="cooling-workspace" value={system} onValueChange={value => choose(value as WorkspaceSystem)}><TabsList aria-label="Predictive demonstration system">{systems.map(item => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}</TabsList>
    <TabsContent value="annual">{system==='annual'&&<AnnualHistoryWorkspace dashboard={dashboard} reload={reload}/>}</TabsContent>
    <TabsContent value="cooling" forceMount hidden={system !== 'cooling'}><CoolingWorkspace dashboard={dashboard} reload={reload} /></TabsContent>
    <TabsContent value="lubrication" forceMount hidden={system !== 'lubrication'}><LubricationWorkspace dashboard={dashboard} reload={reload} /></TabsContent>
  </Tabs>;
}
