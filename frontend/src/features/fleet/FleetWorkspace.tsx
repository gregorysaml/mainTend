import {fleetStatus} from './selectors.ts';
import { useState } from 'react';
import type { Dashboard } from '../../../../shared/types.ts';
import { FleetMap } from '../../components/FleetMap.tsx';
import { formatUtc } from '../../utils/date.ts';
import { fleetRows, fleetSummary, selectFleetRows, selectedFleetRow, observationAgeHours, type FleetFilter, type FleetRow, type FleetSort } from './selectors.ts';
import './fleet.css';
import { Icon, type IconName } from '../../components/Icon.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { latestOdometer } from '../../utils/vehicle-identity.ts';
import { vehicleSignals } from '../../utils/vehicle-signals.ts';

export function FleetRecordSummary({ row, dashboard }: { row: FleetRow; dashboard: Dashboard }) {
  const age = observationAgeHours(row, dashboard.configuration);
  return <div className="fleet-record-summary">
    <div><small>Latest eligible measurement</small><strong>{row.latestEligible ? formatUtc(row.latestEligible.observedAt) : 'No measurement at or before assessment'}</strong>
      {age !== undefined && <small>{age.toFixed(1)} h before assessment{age > dashboard.configuration.observationMaxAgeHours ? ' · exceeds age limit' : ''}</small>}
      {row.futureReadings > 0 && <small>{row.futureReadings} later measurement(s) excluded</small>}
    </div>
    <div><small>Pending maintenance</small><strong>{row.pendingActions} open task{row.pendingActions === 1 ? '' : 's'}</strong><small>Planned + in progress</small></div>
    <div><small>Assessment data</small><strong>{row.insufficient ? 'Needs attention' : 'Required measurements usable'}</strong><small>{row.assessment?.gaps.length ? row.assessment.gaps.map(gap => `${gap.parameter.replaceAll('_', ' ')}: ${gap.reason}`).join(' · ') : row.assessment ? 'A recent reading alone is not a complete assessment.' : 'Assessment unavailable; no normal status assumed.'}</small></div>
  </div>;
}

import type { Reload } from '../maintenance/ActionForms.tsx';
import { VehicleInspector } from '../vehicles/VehicleInspector.tsx';
import { VehicleDirectory } from '../vehicles/VehicleDirectory.tsx';

export function FleetWorkspace({ dashboard, showMap, reload }: { dashboard: Dashboard; showMap: boolean; reload: Reload }) {
  const [filter, setFilter] = useState<FleetFilter>('all'), [query, setQuery] = useState(''), [sort, setSort] = useState<FleetSort>('attention');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = fleetRows(dashboard), summary = fleetSummary(rows), visible = selectFleetRows(rows, filter, query, sort), selected = selectedFleetRow(visible, selectedId);
  const clear = () => { setFilter('all'); setQuery(''); setSort('attention'); };
  const metrics: { filter: FleetFilter; label: string; value: number; detail: string; tone: string; icon: IconName }[] = [
    { filter:'all',label:'Vehicles monitored',value:summary.total,detail:'Recorded fleet',tone:'blue',icon:'vehicles' },
    { filter:'warnings',label:'Condition warnings',value:summary.warningVehicles,detail:'Current recorded conditions',tone:'amber',icon:'warnings' },
    { filter:'insufficient',label:'Data attention',value:summary.insufficientVehicles,detail:'Missing or old readings',tone:'grey',icon:'help' },
    { filter:'pending',label:'Pending actions',value:summary.pendingActions,detail:`Across ${summary.pendingVehicles} vehicle(s)`,tone:'blue',icon:'maintenance' },
  ];
  return <section className={`fleet-workspace fleet-v3 ${showMap ? 'fleet-monitor' : 'fleet-directory'}`} aria-label="Fleet workspace">
    <div className="workspace-context"><div><span className="section-kicker">{showMap ? 'MONITORING WORKSPACE' : 'VEHICLE DIRECTORY'}</span><p>{showMap ? 'Find the vehicle. Understand the concern. Choose a next step.' : 'Identity, condition and maintenance in one place.'}</p></div><a href="#settings"><Icon name="activity" size={15} /><span>Assessment · {formatUtc(dashboard.assessmentTime)}<small>Maximum data age {dashboard.configuration.observationMaxAgeHours} h</small></span><Icon name="settings" size={16} /></a></div>
    <div className="summary-grid fleet-summary" aria-label="Whole-fleet summary">{metrics.map(m => <button type="button" key={m.filter} className={`summary-card fleet-metric ${filter === m.filter ? 'metric-selected' : ''}`} aria-pressed={filter === m.filter} onClick={() => setFilter(m.filter)}><span className={`metric-icon ${m.tone}`}><Icon name={m.icon} /></span><span><small>{m.label}</small><strong>{m.value}</strong><small>{m.detail}</small></span></button>)}</div>
    <section className="fleet-controls" aria-label="Fleet filters"><div className="fleet-filter-fields">
      <label className="search-control">Search vehicles<span><Icon name="search" size={17} /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Registration, name or model" /></span></label>
      <label>Vehicle filter<select value={filter} onChange={e => setFilter(e.target.value as FleetFilter)}><option value="all">All vehicles</option><option value="warnings">Current condition warnings</option><option value="insufficient">Insufficient data</option><option value="pending">Pending maintenance actions</option><option value="clear">Usable data · no condition warning</option></select></label>
      <label>Sort vehicles<select value={sort} onChange={e => setSort(e.target.value as FleetSort)}><option value="attention">Attention first</option><option value="name">Vehicle name</option><option value="latest">Latest measurement first</option><option value="oldest">Oldest / missing measurement first</option></select></label><Button type="button" variant="ghost" onClick={clear}>Reset filters</Button>
    </div><p className="fleet-results" role="status">Showing {visible.length} of {rows.length} vehicles{showMap ? ' · Ledger and map share these filters.' : '.'} Summary metrics count the whole fleet.</p></section>
    {!visible.length ? <div className="workspace-empty"><Icon name="search" size={32} /><h2>No vehicles match these filters</h2><p>Try another registration, name or status.</p><Button variant="secondary" onClick={clear}>Show all vehicles</Button></div> : showMap ? <div className="monitor-grid">
      <section className="compact-ledger" aria-label="Vehicle ledger"><header><span className="section-kicker">ACTIVE LEDGER</span><h2>Fleet vehicles <span>{visible.length}</span></h2><p>Select a vehicle to inspect</p></header><div className="ledger-unit-list">{visible.map(row => <button type="button" key={row.vehicle.id} className="ledger-unit" data-selected={selected?.vehicle.id === row.vehicle.id} aria-pressed={selected?.vehicle.id === row.vehicle.id} aria-label={`Select ${row.vehicle.displayName} · ${row.vehicle.registration}`} onClick={() => setSelectedId(row.vehicle.id)}>
        <div className="ledger-unit-top"><span className="ledger-car"><Icon name="vehicles" /></span><span><strong className="unit-plate">{row.vehicle.registration}</strong><small>{row.vehicle.displayName}</small></span><Icon name="next" size={16} /></div>
        <div className="ledger-unit-bottom"><Badge tone={fleetStatus(row).tone}>{fleetStatus(row).label}</Badge><span>{latestOdometer(row.vehicle)?.kilometres.toLocaleString('en-GB') ?? '—'} km</span></div>
        <div className="ledger-unit-meta">{row.assessment && vehicleSignals(row.vehicle,row.assessment,dashboard.configuration,dashboard.coolingRuns ?? [],dashboard.lubricationRuns ?? []).filter(s => s.id.startsWith('cooling-') || s.id.startsWith('lubrication-')).map(s => <span key={s.id}><Icon name="activity" size={13} />{s.title}</span>)}<small>{row.pendingActions} open tasks</small></div>
      </button>)}</div><p className="ledger-note">No rule alert is not a fault-free verdict. All example inputs are synthetic.</p></section>
      <div className="monitor-map"><FleetMap key={visible.map(r => r.vehicle.id).sort().join(',')} vehicles={visible.map(r => r.vehicle)} assessments={dashboard.assessments} profile="fleet" selectedVehicleId={selected?.vehicle.id} onSelect={setSelectedId} /></div>
      {selected && <VehicleInspector key={selected.vehicle.id} row={selected} dashboard={dashboard} reload={reload} />}
    </div> : <VehicleDirectory rows={visible} dashboard={dashboard} reload={reload} />}
    <details className="fleet-method"><summary>How filtering and prioritisation work</summary><p>Condition warnings count current rule triggers and current recorded concerns from the selected functions. Future planning forecasts are labelled separately. Attention first orders present concerns, planning forecasts, data gaps, pending tasks, then remaining vehicles; it is not a failure-risk score. Missing or old data does not become normal. Latest eligible measurement is at or before the saved assessment time. Summary metrics always count the whole fleet.</p></details>
  </section>;
}
