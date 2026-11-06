import type { Dashboard, Profile, Vehicle } from '../../../../shared/types.ts';
import { coolingMatchesSettings, type CoolingRun } from '../../../../shared/cooling.ts';
import { lubricationMatchesSettings, type LubricationRun } from '../../../../shared/lubrication.ts';

export const maintenanceViews = ['predictions', 'recommendations', 'service'] as const;
// One designated example vehicle in each workspace, not a simulated assessment
// offered for every fleet vehicle. Owner keeps its existing single-vehicle view.
export function isCoolingDemoVehicle(vehicle: Pick<Vehicle, 'id' | 'profile'>): boolean {
  const ids: Record<Profile, string> = { fleet: 'FLEET-002', owner: 'OWNER-001' };
  return vehicle.id === ids[vehicle.profile];
}
export function coolingDemoVehicles(dashboard: Dashboard): Vehicle[] {
  return dashboard.vehicles.filter(v => v.profile === dashboard.profile && isCoolingDemoVehicle(v));
}
export function isLubricationDemoVehicle(vehicle: Pick<Vehicle, 'id' | 'profile'>): boolean {
  return vehicle.id === (vehicle.profile === 'fleet' ? 'FLEET-003' : 'OWNER-001');
}
export function lubricationDemoVehicles(dashboard: Dashboard): Vehicle[] {
  return dashboard.vehicles.filter(v => v.profile === dashboard.profile && isLubricationDemoVehicle(v));
}
export type PredictiveSystem = 'cooling' | 'lubrication';
export type MaintenanceView = typeof maintenanceViews[number];
export interface MaintenanceRequest { vehicleId: string; runId: string | null; view: MaintenanceView; system?: PredictiveSystem }
export function maintenanceHref(vehicleId: string, runId?: string | null, view: MaintenanceView = 'predictions', system: PredictiveSystem = 'cooling'): string {
  const params = new URLSearchParams({ vehicle: vehicleId });
  if (system === 'lubrication') params.set('system', system);
  if (runId) params.set('run', runId);
  if (view !== 'predictions') params.set('view', view);
  return `#maintenance?${params}`;
}
export function readMaintenanceRequest(hash: string): MaintenanceRequest | null {
  if (!hash.startsWith('#maintenance?')) return null;
  const params = new URLSearchParams(hash.slice('#maintenance?'.length));
  if (!params.get('vehicle')) return null;
  if (params.has('system') && !['cooling', 'lubrication'].includes(params.get('system')!)) return null;
  const requestedView = params.get('view');
  return { vehicleId: params.get('vehicle')!, runId: params.get('run'), view: maintenanceViews.includes(requestedView as MaintenanceView) ? requestedView as MaintenanceView : 'predictions', ...(params.get('system') === 'lubrication' ? { system: 'lubrication' as const } : {}) };
}
export function resolveMaintenanceRequest(dashboard: Dashboard, request: MaintenanceRequest) {
  const vehicle = dashboard.vehicles.find(v => v.id === request.vehicleId && v.profile === dashboard.profile);
  if (!vehicle) return { error: 'Vehicle not available in this profile.' } as const;
  if (request.system === 'lubrication') {
    const runs = (dashboard.lubricationRuns ?? []).filter(r => r.vehicleId === vehicle.id && r.profile === dashboard.profile);
    const lubricationRun = request.runId ? runs.find(r => r.id === request.runId) : runs.find(r => r.selected);
    if (request.runId && !lubricationRun) return { error: 'Lubrication snapshot not available for this vehicle and profile.' } as const;
    return { vehicle, run: undefined, lubricationRun, error: null } as const;
  }
  const runs = (dashboard.coolingRuns ?? []).filter(r => r.vehicleId === vehicle.id && r.profile === dashboard.profile);
  const run = request.runId ? runs.find(r => r.id === request.runId) : runs.find(r => r.selected);
  if (request.runId && !run) return { error: 'Cooling snapshot not available for this vehicle and profile.' } as const;
  return { vehicle, run, lubricationRun: undefined, error: null } as const;
}
export function lubricationAdvice(run: LubricationRun | undefined, dashboard: Dashboard): { title: string; text: string; task: string | null } {
  if (!run) return { title: 'A lubrication prediction is not available yet', text: 'Use the separate demo controls. Missing comparable oil-pressure history is not treated as normal.', task: null };
  if (!run.selected || !lubricationMatchesSettings(run, dashboard.assessmentTime, dashboard.configuration.observationMaxAgeHours)) return { title: 'This is saved decision evidence', text: 'Review the current selected assessment before planning a new check. This archived snapshot is retained, not recalculated.', task: null };
  if (run.result.status === 'stable') return { title: 'No automatic service action suggested', text: 'No adverse pressure trend was detected in the comparable synthetic sessions. This does not establish a fault-free engine or replace its manufacturer maintenance schedule.', task: null };
  if (run.result.status === 'insufficient' || run.result.status === 'unreliable') return { title: 'Verify comparable pressure measurements', text: 'The demo cannot support a forecast. Verify recent readings and sensor reliability at comparable RPM, load and oil temperature before inferring a mechanical cause.', task: 'Collect and verify comparable oil-pressure measurements' };
  if (run.result.status === 'anomaly') return { title: 'Escalate the reported low-pressure anomaly', text: 'This synthetic current anomaly is not an advance prediction. Request a qualified assessment; do not treat it as a routine oil-change reminder or use the forecast to postpone responding to a real warning.', task: 'Request a qualified assessment of the reported low oil-pressure anomaly' };
  return { title: 'Plan a lubrication-system assessment', text: 'The synthetic comparable sessions show a falling pressure trend. Ask a qualified technician to verify the pressure measurement and investigate the lubrication system. No pump, bearing, oil grade or replacement is diagnosed by this app.', task: 'Verify the oil-pressure trend and assess the lubrication system' };
}
export function coolingAdvice(run: CoolingRun | undefined, dashboard: Dashboard): { title: string; text: string; task: string | null } {
  if (!run) return { title: 'A prediction is not available yet', text: 'Use the separate demo controls to explore an example. No vehicle condition is assumed from missing cooling history.', task: null };
  if (!run.selected || !coolingMatchesSettings(run, dashboard.assessmentTime, dashboard.configuration.observationMaxAgeHours)) return { title: 'This is saved decision evidence', text: 'Review the current selected assessment before planning a new check. This archived snapshot has not been recalculated.', task: null };
  if (run.result.status === 'stable') return { title: 'No automatic service action suggested', text: 'No adverse trend was detected in the comparable synthetic sessions. This does not establish that the vehicle is fault-free or replace its manufacturer maintenance schedule.', task: null };
  if (run.result.status === 'insufficient' || run.result.status === 'unreliable') return { title: 'Collect better comparable measurements', text: 'The demo cannot support a forecast. Record or verify recent, comparable cooling measurements before inferring a mechanical problem.', task: 'Collect and verify comparable cooling measurements' };
  if (run.result.status === 'anomaly') return { title: 'Request a cooling-system assessment', text: 'The synthetic example has a current anomaly, not an advance prediction. A qualified inspection is needed to determine any cause; the app cannot decide whether a real vehicle is safe to drive.', task: 'Inspect the reported cooling-system anomaly' };
  return { title: 'Plan a cooling-system check', text: 'The comparable-session demo shows a rising trend. Review the supporting readings and arrange a check; it does not identify a failed part or justify an automatic replacement.', task: 'Review the cooling trend and plan an inspection' };
}
