import type { Assessment, Dashboard, Observation, ScenarioConfig, Vehicle } from '../../../../shared/types.ts';
import {isCurrentCondition} from '../../../../shared/selected-warnings.ts';

export type FleetFilter = 'all' | 'warnings' | 'insufficient' | 'pending' | 'clear';
export type FleetSort = 'attention' | 'name' | 'latest' | 'oldest';
export interface FleetRow {
  vehicle: Vehicle;
  assessment?: Assessment;
  conditionWarnings: number;
  forecastWarnings: number;
  insufficient: boolean;
  pendingActions: number;
  latestEligible?: Observation;
  futureReadings: number;
}

export function fleetRows(dashboard: Dashboard): FleetRow[] {
  const assessmentTime = Date.parse(dashboard.assessmentTime);
  const assessments = new Map(dashboard.assessments.map(item => [item.vehicleId, item]));
  return dashboard.vehicles.filter(vehicle => vehicle.profile === 'fleet').map(vehicle => {
    const assessment = assessments.get(vehicle.id);
    const eligible = vehicle.observations.filter(item => Number.isFinite(Date.parse(item.observedAt)) && Date.parse(item.observedAt) <= assessmentTime);
    const latestEligible = eligible.reduce<Observation | undefined>((latest, item) => !latest || Date.parse(item.observedAt) > Date.parse(latest.observedAt) || (Date.parse(item.observedAt) === Date.parse(latest.observedAt) && item.id > latest.id) ? item : latest, undefined);
    return {
      vehicle, assessment,
      conditionWarnings: (assessment?.dataStatus === 'Sufficient' ? assessment.triggers.length : 0)+vehicle.warnings.filter(w=>w.sourceType==='selected_forecast'&&isCurrentCondition(w)).length,
      forecastWarnings:vehicle.warnings.filter(w=>w.sourceType==='selected_forecast'&&w.current===true&&w.attentionKind==='forecast').length,
      insufficient: assessment?.dataStatus !== 'Sufficient',
      pendingActions: vehicle.actions.filter(action => action.status === 'planned' || action.status === 'in progress').length,
      latestEligible,
      futureReadings: vehicle.observations.filter(item => Date.parse(item.observedAt) > assessmentTime).length,
    };
  });
}

export function fleetSummary(rows: FleetRow[]) {
  return {
    total: rows.length,
    warningVehicles: rows.filter(row => row.conditionWarnings > 0).length,
    insufficientVehicles: rows.filter(row => row.insufficient).length,
    pendingVehicles: rows.filter(row => row.pendingActions > 0).length,
    pendingActions: rows.reduce((count, row) => count + row.pendingActions, 0),
  };
}

export function selectFleetRows(rows: FleetRow[], filter: FleetFilter, query: string, sort: FleetSort): FleetRow[] {
  const search = query.trim().toLocaleLowerCase('en');
  const matches = rows.filter(row => {
    const filterMatch = filter === 'all' || (filter === 'warnings' && row.conditionWarnings > 0) || (filter === 'insufficient' && row.insufficient) || (filter === 'pending' && row.pendingActions > 0) || (filter === 'clear' && !row.insufficient && row.conditionWarnings === 0);
    const { id, displayName, registration, makeModel } = row.vehicle;
    return filterMatch && [id, displayName, registration, makeModel].some(value => value.toLocaleLowerCase('en').includes(search));
  });
  const nameOrder = (a: FleetRow, b: FleetRow) => a.vehicle.displayName.localeCompare(b.vehicle.displayName, 'en') || a.vehicle.id.localeCompare(b.vehicle.id, 'en');
  // Stable, transparent triage order; it is not a calculated failure risk score.
  const rank = (row: FleetRow) => row.conditionWarnings > 0 ? 0 : row.forecastWarnings > 0 ? 1 : row.insufficient ? 2 : row.pendingActions > 0 ? 3 : 4;
  return matches.sort((a, b) => {
    if (sort === 'attention') return rank(a) - rank(b) || nameOrder(a, b);
    if (sort === 'name') return nameOrder(a, b);
    // Missing eligible measurements come first for oldest, last for latest.
    const aTime = a.latestEligible ? Date.parse(a.latestEligible.observedAt) : -Infinity;
    const bTime = b.latestEligible ? Date.parse(b.latestEligible.observedAt) : -Infinity;
    return (aTime === bTime ? 0 : sort === 'latest' ? bTime - aTime : aTime - bTime) || nameOrder(a, b);
  });
}

export function fleetStatus(row:FleetRow):{tone:'warning'|'synthetic'|'neutral'|'success';label:string}{
  return row.conditionWarnings?{tone:'warning',label:'Current condition'}:row.forecastWarnings?{tone:'synthetic',label:'Planning forecast'}:row.insufficient?{tone:'neutral',label:'Data incomplete'}:{tone:'success',label:'No rule alert'};
}

export function observationAgeHours(row: FleetRow, configuration: ScenarioConfig): number | undefined {
  return row.latestEligible ? (Date.parse(configuration.assessmentTime) - Date.parse(row.latestEligible.observedAt)) / 3_600_000 : undefined;
}

/** Selection is always within the currently filtered ledger, never another profile. */
export function selectedFleetRow(visible: FleetRow[], selectedId: string | null): FleetRow | undefined {
  return visible.find(row => row.vehicle.id === selectedId) ?? visible[0];
}
