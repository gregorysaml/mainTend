import type { Vehicle } from '../../../shared/types.ts';

// Presentation only: retain the original source in storage and evidence exports.
export function mileageSourceLabel(source: string): string {
  return source === 'Synthetic fleet entry' ? 'Recorded entry' : source;
}

export function latestOdometer(vehicle: Vehicle) {
  return vehicle.details?.odometerHistory.filter(item => Number.isFinite(Date.parse(item.recordedAt))).toSorted((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt) || b.id - a.id)[0];
}
