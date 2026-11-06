import type {DatabaseSync} from 'node:sqlite';
import type {Journey} from '../../../shared/journeys.ts';

export const journeysSchema=`CREATE TABLE IF NOT EXISTS vehicle_journeys(id TEXT PRIMARY KEY,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),started_at TEXT NOT NULL,ended_at TEXT NOT NULL,journey_json TEXT NOT NULL);CREATE INDEX IF NOT EXISTS vehicle_journeys_latest ON vehicle_journeys(vehicle_id,ended_at);`;
export function constructedOwnerJourneys(vehicleId:string,endedAt:string):Journey[]{
  const end=Date.parse(endedAt);if(!Number.isFinite(end))throw new Error('Journey needs a valid source time.');
  // Illustrative geometry only; not map-matched, acquired GPS or a verified road itinerary.
  const nodes:[number,number][]=[[37.9761,23.7347],[37.9763,23.7378],[37.9775,23.7417],[37.9796,23.7458],[37.9821,23.7504],[37.9841,23.7554],[37.9862,23.7595],[37.9892,23.7630],[37.9924,23.7691]];
  return [0,1,2].map(day=>{
    const reverse=day===1,route=reverse?[...nodes].reverse():nodes;
    const finish=end-day*86400000,start=finish-(day===0?40:35+day)*60000;
    const coordinates:[number,number][]=[];
    for(let n=0;n<route.length-1;n++)for(let k=0;k<4;k++)coordinates.push([route[n][0]+(route[n+1][0]-route[n][0])*k/4,route[n][1]+(route[n+1][1]-route[n][1])*k/4]);
    coordinates.push(route.at(-1)!);
    return {id:`JOURNEY-${vehicleId}-constructed-v1-${day}`,vehicleId,startedAt:new Date(start).toISOString(),endedAt:new Date(finish).toISOString(),from:reverse?'Zografou':'City centre',to:reverse?'City centre':'Zografou',dataOrigin:'constructed fixture',source:'MainTend constructed journey history — no live GPS',points:coordinates.map(([latitude,longitude],k)=>({latitude,longitude,recordedAt:new Date(start+(finish-start)*k/(coordinates.length-1)).toISOString()}))};
  });
}
export function seedOwnerJourneys(db:DatabaseSync){
  const extension='owner-journeys-constructed-v1';if(db.prepare('SELECT id FROM demo_extensions WHERE id=?').get(extension))return;
  const vehicle=db.prepare("SELECT v.id,l.recorded_at FROM vehicles v JOIN vehicle_locations l ON l.vehicle_id=v.id WHERE v.id='OWNER-001' AND v.profile='owner'").get() as {id:string;recorded_at:string}|undefined;
  if(!vehicle)return;
  const journeys=constructedOwnerJourneys(vehicle.id,vehicle.recorded_at);
  db.exec('BEGIN IMMEDIATE');try{
    for(const j of journeys)db.prepare('INSERT OR IGNORE INTO vehicle_journeys VALUES(?,?,?,?,?)').run(j.id,j.vehicleId,j.startedAt,j.endedAt,JSON.stringify(j));
    db.prepare('INSERT INTO demo_extensions VALUES(?,?)').run(extension,new Date().toISOString());db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}
export function getJourneys(db:DatabaseSync,vehicleId:string):Journey[]{
  return (db.prepare('SELECT journey_json FROM vehicle_journeys WHERE vehicle_id=? ORDER BY ended_at DESC,id').all(vehicleId) as {journey_json:string}[]).map(row=>JSON.parse(row.journey_json));
}
