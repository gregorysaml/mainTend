import {fleetStatus} from '../fleet/selectors.ts';
import { useState } from 'react';
import type { Dashboard, Vehicle } from '../../../../shared/types.ts';
import type { FleetRow } from '../fleet/selectors.ts';
import type { Reload } from '../maintenance/ActionForms.tsx';
import { VehicleAvatar } from './VehicleAvatar.tsx';
import { VehicleProfileEditor } from './VehicleProfileEditor.tsx';
import { MeasurementHistory } from '../../components/MeasurementHistory.tsx';
import { VehicleProfile } from '../../components/VehicleProfile.tsx';
import { latestOdometer } from '../../utils/vehicle-identity.ts';
import { vehicleSignals } from '../../utils/vehicle-signals.ts';
import { formatUtc } from '../../utils/date.ts';
import { warningOrigin } from '../../utils/warning-origin.ts';
import { maintenanceHref } from '../predictive/presentation.ts';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs.tsx';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog.tsx';
import { Icon } from '../../components/Icon.tsx';
import {CapabilitySummary} from '../maintenance/CapabilitySummary.tsx';

export function VehicleRecords({ vehicle, dashboard, open, onClose }: { vehicle: Vehicle; dashboard: Dashboard; open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState('measurements');
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="records-dialog">
    <header className="records-header"><div><span className="section-kicker">VEHICLE RECORDS · {vehicle.registration}</span><DialogTitle>{vehicle.displayName}</DialogTitle><DialogDescription>{vehicle.makeModel} · Stored records, not live telemetry</DialogDescription></div><Button variant="secondary" size="icon" aria-label="Close vehicle records" onClick={onClose}><Icon name="close" /></Button></header>
    <Tabs className="records-tabs" value={tab} onValueChange={setTab}><TabsList aria-label="Vehicle records"><TabsTrigger value="measurements">Measurements</TabsTrigger><TabsTrigger value="profile">Profile</TabsTrigger><TabsTrigger value="service">Service & tasks</TabsTrigger></TabsList><div className="records-body">
      <TabsContent value="measurements" forceMount hidden={tab !== 'measurements'}><MeasurementHistory vehicle={vehicle} configuration={dashboard.configuration} /><details><summary>Latest observations</summary>{vehicle.observations.map(o => <p key={o.id}><strong>{o.parameter.replaceAll('_',' ')} · {o.value} {o.unit}</strong><br />{formatUtc(o.observedAt)}{o.source && <><br />Original: {o.source.value} {o.source.unit} · {o.source.conversion}</>}</p>)}</details></TabsContent>
      <TabsContent value="profile" forceMount hidden={tab !== 'profile'}><VehicleProfile vehicle={vehicle} /></TabsContent>
      <TabsContent value="service" forceMount hidden={tab !== 'service'}><h3>Recorded tasks · {vehicle.actions.length}</h3>{!vehicle.actions.length && <p className="muted">No maintenance tasks recorded.</p>}{vehicle.actions.map(action => <article className="record-service" key={action.id}><Badge>{action.status}</Badge><h4>{action.task}</h4><p>{action.dueDate ? `Due ${action.dueDate}` : 'Unscheduled'} · {action.priority ?? 'normal'} priority{action.assignedTo ? ` · ${action.assignedTo}` : ''}</p>{action.outcome && <p>Reported outcome: {action.outcome}</p>}</article>)}{vehicle.details && <div className="record-service"><small>Last recorded service</small><h3>{vehicle.details.lastServiceAt}</h3><p>{vehicle.details.lastServiceKm.toLocaleString('en-GB')} km · baseline or unverified user entry</p></div>}<Button asChild variant="secondary"><a href="#maintenance" onClick={onClose}>Open maintenance workspace <Icon name="arrow" size={16} /></a></Button></TabsContent>
    </div></Tabs>
  </DialogContent></Dialog>;
}

export function VehicleInspector({ row, dashboard, reload }: { row: FleetRow; dashboard: Dashboard; reload: Reload }) {
  const [recordsOpen, setRecordsOpen] = useState(false);
  const vehicle = row.vehicle, odometer = latestOdometer(vehicle);
  const signals = row.assessment ? vehicleSignals(vehicle, row.assessment, dashboard.configuration, dashboard.coolingRuns ?? [], dashboard.lubricationRuns ?? []) : [];
  const warnings = vehicle.warnings.filter(w => w.current !== false);
  return <section className="unit-inspector" aria-label={`Selected vehicle ${vehicle.registration}`}>
    <div className="inspector-heading"><span className="section-kicker">VEHICLE INSPECTOR</span><Badge tone={fleetStatus(row).tone}>{fleetStatus(row).label}</Badge></div>
    <div className="inspector-identity"><VehicleAvatar vehicle={vehicle} large /><div><span className="unit-plate">{vehicle.registration}</span><h2>{vehicle.displayName}</h2><p>{vehicle.makeModel} · {vehicle.details?.modelYear ?? 'Year not recorded'}</p></div></div>
    <div className="inspector-mileage"><div><small>Recorded mileage</small><strong>{odometer?.kilometres.toLocaleString('en-GB') ?? '—'} <span>km</span></strong><small>{odometer ? `${formatUtc(odometer.recordedAt)} · not live` : 'No mileage record'}</small></div><VehicleProfileEditor vehicle={vehicle} reload={reload} compact /></div>
    <div className="inspector-readings"><div><small>Latest eligible reading</small><strong>{row.latestEligible ? formatUtc(row.latestEligible.observedAt) : 'Not available'}</strong></div><div><small>Open tasks</small><strong>{row.pendingActions}</strong></div></div>
    <div className="inspector-concerns"><h3>Attention & next steps</h3>{row.insufficient && <div className="concern-neutral"><Icon name="help" size={18} /><div><strong>Assessment withheld</strong><p>{row.assessment?.gaps.map(g => `${g.parameter.replaceAll('_',' ')}: ${g.reason}`).join(' · ') || 'Assessment unavailable'}. No normal values assumed.</p></div></div>}
      {warnings.map(w => <div key={w.id} className={`inspector-concern ${w.sourceType === 'rule' ? 'concern-rule' : 'concern-prediction'}`}><Badge tone={warningOrigin(w).tone}>{warningOrigin(w).label}</Badge><h4>{w.title}</h4>{['computed_cooling','computed_lubrication'].includes(w.sourceType) ? <Button asChild variant="secondary"><a href={maintenanceHref(vehicle.id,w.sourceRef,'predictions',w.sourceType === 'computed_lubrication' ? 'lubrication' : 'cooling')}>Review prediction <Icon name="arrow" size={16} /></a></Button> : <Button asChild variant="secondary"><a href="#warnings">Review warning evidence <Icon name="arrow" size={16} /></a></Button>}</div>)}
      {!warnings.length && <p className="inspector-note">No current warning recorded. This does not establish that the vehicle is fault-free.</p>}
      {signals.filter(s => s.id.startsWith('cooling-') || s.id.startsWith('lubrication-')).filter(s => !warnings.some(w => s.href?.includes(w.sourceRef))).map(s => <a key={s.id} href={s.href} className="inspector-demo"><Icon name="activity" /><span><strong>{s.title}</strong><small>{s.detail} · synthetic</small></span><Icon name="next" size={16} /></a>)}
    </div><Button variant="secondary" className="inspector-records" onClick={() => setRecordsOpen(true)}>View full vehicle records <Icon name="next" size={16} /></Button>
    <CapabilitySummary key={`${vehicle.makeModel}-${vehicle.details?.modelYear}-${vehicle.details?.fuelType}`} vehicleId={vehicle.id} profile={dashboard.profile} assessmentTime={dashboard.assessmentTime}/>
    <VehicleRecords vehicle={vehicle} dashboard={dashboard} open={recordsOpen} onClose={() => setRecordsOpen(false)} />
  </section>;
}
