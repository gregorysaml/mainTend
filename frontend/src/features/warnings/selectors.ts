import type { Dashboard, Vehicle, Warning } from '../../../../shared/types.ts';
import {warningPriority} from '../../../../shared/selected-warnings.ts';
export interface WarningRecord { vehicle: Vehicle; warning: Warning }
export function warningRecords(dashboard: Dashboard) {
  const all = dashboard.vehicles.filter(vehicle => vehicle.profile === dashboard.profile).flatMap(vehicle => vehicle.warnings.map(warning => ({ vehicle, warning })));
  const sort=(a:WarningRecord,b:WarningRecord)=>warningPriority(a.warning,b.warning);
  return { current: all.filter(row => row.warning.current !== false).sort(sort), historical: all.filter(row => row.warning.current === false).sort(sort) };
}
export function selectWarningRecord(records: WarningRecord[], selectedId: string | null) { return records.find(row => row.warning.id === selectedId) ?? records[0]; }
