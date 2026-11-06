import type {DatabaseSync} from 'node:sqlite';
import type {Store} from '../lib/store.mjs';
import type {ServiceFunction} from '../shared/service.ts';
/** Explicit test-only configuration. Never used against the running vehicle database. */
export function setTestPowertrain(store:Store,vehicleId:string,fuelType:string){
  (store as unknown as {db:DatabaseSync}).db.prepare('UPDATE vehicle_details SET fuel_type=? WHERE vehicle_id=?').run(fuelType,vehicleId);
}
export function configureTestFunction(store:Store,vehicleId:string,fn:ServiceFunction){setTestPowertrain(store,vehicleId,fn==='battery'||fn==='charging'?'Electric':fn==='dpf'?'Diesel':'Petrol');}
