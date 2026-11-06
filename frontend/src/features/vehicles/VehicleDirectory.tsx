import {fleetStatus} from '../fleet/selectors.ts';
import { useState } from 'react';
import type { Dashboard } from '../../../../shared/types.ts';
import type { FleetRow } from '../fleet/selectors.ts';
import type { Reload } from '../maintenance/ActionForms.tsx';
import { VehicleAvatar } from './VehicleAvatar.tsx';
import { VehicleRecords } from './VehicleInspector.tsx';
import { VehicleProfileEditor } from './VehicleProfileEditor.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Icon } from '../../components/Icon.tsx';
import { latestOdometer } from '../../utils/vehicle-identity.ts';
import { vehicleSignals } from '../../utils/vehicle-signals.ts';
export function VehicleDirectory({ rows, dashboard, reload }: { rows: FleetRow[]; dashboard: Dashboard; reload: Reload }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return <div className="vehicle-directory">{rows.map(row => { const v = row.vehicle, km = latestOdometer(v); const signals = row.assessment ? vehicleSignals(v,row.assessment,dashboard.configuration,dashboard.coolingRuns ?? [],dashboard.lubricationRuns ?? []) : [];
    return <article className="unit-tile" key={v.id}><div className="tile-topline"><span className="unit-plate">{v.registration}</span><Badge tone={fleetStatus(row).tone}>{fleetStatus(row).label}</Badge></div><div className="tile-identity"><VehicleAvatar vehicle={v} large /><div><h2>{v.displayName}</h2><p>{v.makeModel} · {v.details?.modelYear ?? 'Year not recorded'}</p><small>{v.details?.fuelType ?? 'Fuel not recorded'} · {v.id}</small></div></div>
      <div className="tile-mileage"><span>Recorded mileage<strong>{km?.kilometres.toLocaleString('en-GB') ?? '—'} <small>km · not live</small></strong></span><VehicleProfileEditor vehicle={v} reload={reload} compact /></div>
      <div className="tile-indicators" aria-label={`Current indicators for ${v.registration}`}>{signals.map(s => s.href ? <a href={s.href} key={s.id} className={`tile-signal signal-${s.tone}`}><Icon name={s.icon} size={18} /><span><strong>{s.title}</strong><small>{s.detail}</small></span><Icon name="arrow" size={14} /></a> : <div className="tile-signal" key={s.id}><Icon name={s.icon} size={18} /><span><strong>{s.title}</strong><small>{s.detail}</small></span></div>)}</div>
      <footer className="tile-footer"><span><Icon name="maintenance" size={15} />{row.pendingActions} open tasks</span><Button variant="secondary" onClick={() => setOpenId(v.id)}>View records <Icon name="next" size={16} /></Button></footer>
      <VehicleRecords vehicle={v} dashboard={dashboard} open={openId === v.id} onClose={() => setOpenId(null)} />
    </article>;
  })}</div>;
}
