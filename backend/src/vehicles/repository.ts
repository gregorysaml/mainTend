import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import type { Vehicle } from '../../../shared/types.ts';
import { validateProfileInput } from './validation.ts';

export function saveVehicleProfile(db: DatabaseSync, vehicle: Vehicle, raw: unknown, now = new Date().toISOString()): void {
  const input = validateProfileInput(raw, now);
  if (input.profile !== vehicle.profile) throw new Error('Profile does not match this vehicle.');
  if (!vehicle.details) throw new Error('Vehicle specifications are unavailable.');
  const details = vehicle.details;
  const mileage = details.odometerHistory.toSorted((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))[0];
  if (input.section === 'mileage') {
    const value = input.value;
    for (const point of details.odometerHistory) {
      if (Date.parse(point.recordedAt) === Date.parse(value.recordedAt)) throw new Error('A mileage reading already exists at this time.');
      if ((Date.parse(point.recordedAt) < Date.parse(value.recordedAt) && point.kilometres > value.kilometres) || (Date.parse(point.recordedAt) > Date.parse(value.recordedAt) && point.kilometres < value.kilometres)) throw new Error('Mileage must not decrease over time. Earlier records are retained.');
    }
    if (value.recordedAt.slice(0, 10) >= details.lastServiceAt && value.kilometres < details.lastServiceKm) throw new Error('Mileage cannot be below the recorded service mileage.');
  }
  if (input.section === 'service' && (!mileage || input.value.lastServiceKm > mileage.kilometres)) throw new Error('Add a current mileage reading before recording a service at higher mileage.');
  if (input.section === 'service' && details.odometerHistory.some(p => (p.recordedAt.slice(0, 10) < input.value.lastServiceAt && p.kilometres > input.value.lastServiceKm) || (p.recordedAt.slice(0, 10) > input.value.lastServiceAt && p.kilometres < input.value.lastServiceKm))) throw new Error('Service mileage must be consistent with the dated mileage history.');
  if (input.section === 'tyres' && input.value.some(t => !mileage || t.installedKm > mileage.kilometres)) throw new Error('Tyre installation mileage cannot exceed the latest recorded mileage.');
  const photoMetadata = (url: string | undefined, description: string | undefined) => ({ present: !!url, sha256: url ? createHash('sha256').update(url).digest('hex') : null, description: description ?? null });
  const before = input.section === 'mileage' ? details.odometerHistory : input.section === 'service' ? { lastServiceAt: details.lastServiceAt, lastServiceKm: details.lastServiceKm } : input.section === 'photo' ? photoMetadata(details.photoUrl, details.photoDescription) : details[input.section];
  const after = input.section === 'photo' ? photoMetadata(input.value?.dataUrl, input.value?.description) : input.value;
  // Photo audit records contain a digest, not repeated copies of image bytes.
  db.exec('BEGIN IMMEDIATE');
  try {
    const revision = Number(db.prepare('SELECT COALESCE(MAX(id),0) revision FROM vehicle_profile_history WHERE vehicle_id=?').get(vehicle.id)!.revision);
    if (input.revision !== revision) throw new Error('This profile changed since you opened it. Your draft is retained here; copy it before refreshing the page to load the latest profile.');
    switch (input.section) {
      case 'mileage': db.prepare("INSERT INTO odometer_readings(vehicle_id,kilometres,recorded_at,source) VALUES(?,?,?,'user entered')").run(vehicle.id, input.value.kilometres, input.value.recordedAt); break;
      case 'service': db.prepare('UPDATE vehicle_details SET last_service_at=?,last_service_km=? WHERE vehicle_id=?').run(input.value.lastServiceAt, input.value.lastServiceKm, vehicle.id); break;
      case 'equipment':
        db.prepare('DELETE FROM vehicle_equipment WHERE vehicle_id=?').run(vehicle.id);
        for (const name of input.value) db.prepare('INSERT INTO vehicle_equipment VALUES(?,?)').run(vehicle.id, name);
        break;
      case 'tyres':
        db.prepare('DELETE FROM vehicle_tyres WHERE vehicle_id=?').run(vehicle.id);
        for (const t of input.value) db.prepare('INSERT INTO vehicle_tyres VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(vehicle.id, t.position, t.brand, t.model, t.size, t.season, t.dotCode, t.installedAt, t.installedKm, t.pressureBar, t.treadMm, t.measuredAt, t.lastRotationAt);
        break;
      case 'photo': db.prepare('UPDATE vehicle_details SET photo_url=?,photo_description=? WHERE vehicle_id=?').run(input.value?.dataUrl ?? null, input.value?.description ?? null, vehicle.id); break;
    }
    db.prepare('INSERT INTO vehicle_profile_history(vehicle_id,section,note,changed_at,before_json,after_json) VALUES(?,?,?,?,?,?)').run(vehicle.id, input.section, input.note, now, JSON.stringify(before), JSON.stringify(after));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw new Error(error instanceof Error && error.message.includes('changed since') ? error.message : 'Could not save the profile. No partial changes were saved; your draft can be retried.', { cause: error });
  }
}
