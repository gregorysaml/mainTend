import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { annualHistory, annualHistoryVersion, type StoredAnnualHistory } from '../../../shared/annual-history.ts';
import type { Profile } from '../../../shared/types.ts';
import { saveSelected } from './selected.ts';

export const annualSchema = `CREATE TABLE IF NOT EXISTS annual_histories(
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id), version TEXT NOT NULL, created_at TEXT NOT NULL,
  input_sha256 TEXT NOT NULL, history_json TEXT NOT NULL, PRIMARY KEY(vehicle_id,version));`;

export function seedAnnualHistories(db:DatabaseSync, assessmentTime:string) {
  const vehicles = db.prepare('SELECT v.id,d.fuel_type FROM vehicles v LEFT JOIN vehicle_details d ON d.vehicle_id=v.id ORDER BY v.id').all() as {id:string;fuel_type:string|null}[];
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const v of vehicles) {
      if (db.prepare('SELECT 1 FROM annual_histories WHERE vehicle_id=? AND version=?').get(v.id,annualHistoryVersion)) continue;
      const history=annualHistory(v.id,v.fuel_type ?? 'unknown',assessmentTime), json=JSON.stringify(history);
      db.prepare('INSERT INTO annual_histories VALUES(?,?,?,?,?)').run(v.id,annualHistoryVersion,new Date().toISOString(),createHash('sha256').update(json).digest('hex'),json);
    }
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK'); throw error; }
}
export function getAnnualHistory(db:DatabaseSync, vehicleId:string, profile:Profile):StoredAnnualHistory|null {
  if (!db.prepare('SELECT id FROM vehicles WHERE id=? AND profile=?').get(vehicleId,profile)) throw new Error('Vehicle not found for selected profile.');
  const record=db.prepare('SELECT * FROM annual_histories WHERE vehicle_id=? AND version=?').get(vehicleId,annualHistoryVersion) as {history_json:string;created_at:string;input_sha256:string}|undefined;
  return record ? {...JSON.parse(record.history_json),createdAt:record.created_at,inputSha256:record.input_sha256} : null;
}
export function evaluateAnnualHistory(db:DatabaseSync,vehicleId:string,profile:Profile,seriesId:unknown,assessmentTime:string,simulateFailure=false) {
  const history=getAnnualHistory(db,vehicleId,profile),series=history?.series.find(s=>s.id===seriesId);
  if(!series)throw new Error('Stored annual series not found.');
  return saveSelected(db,vehicleId,profile,series.input,assessmentTime,simulateFailure);
}
