import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../lib/store.mjs';
import {forecastFixture} from '../shared/forecast-fixtures.ts';
import {configureTestFunction,setTestPowertrain} from './fixture-configuration.ts';
import {isCurrentCondition,selectedWarningState} from '../shared/selected-warnings.ts';
import {warningRecords} from '../frontend/src/features/warnings/selectors.ts';
import {fleetRows,fleetStatus,selectFleetRows} from '../frontend/src/features/fleet/selectors.ts';
import {warningOrigin} from '../frontend/src/utils/warning-origin.ts';
import {journeyHistory,journeyDistanceKm} from '../shared/journeys.ts';
import {constructedOwnerJourneys} from '../backend/src/vehicles/journeys.ts';
import {createApiServer} from '../backend/src/http/app.ts';
import {buildEvidenceReport,evidenceCsv} from '../backend/src/evidence/report.ts';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),config=JSON.parse(fs.readFileSync(path.join(root,'config/scenario.json'),'utf8'));
const now=config.assessmentTime;
const fresh=()=>{const s=new Store(':memory:',root);s.seed();return s;};

test('FR3/FR5–FR8 current concerns reach the shared inbox in both controlled profiles',()=>{
  const s=fresh();try{for(const [profile,id] of [['fleet','FLEET-001'],['owner','OWNER-001']] as const){
    for(const fn of ['tyres','oil','dpf','battery'] as const){
      configureTestFunction(s,id,fn);
      const [run]=s.saveSelectedRun(id,profile,forecastFixture(fn,now,'current'),config);
      const w=s.getSnapshot(profile,config).vehicles.find(v=>v.id===id)!.warnings.find(w=>w.id===run.warningId)!;
      assert.equal(w.current,true);assert.equal(w.active,1);assert.equal(w.attentionKind,'current condition');assert.equal(w.simulated,true);
      assert.equal(w.selectedEvidence!.runId,run.id);assert.equal(w.selectedEvidence!.methodVersion,run.result.methodVersion);assert.equal(w.selectedEvidence!.source,run.input.source);
      assert.match(warningOrigin(w).label,/Current condition/);assert.match(warningOrigin(w).label,/synthetic/);
    }
  }}finally{s.close();}
});
test('current conditions precede forecasts and block use planning despite positive margins',()=>{
  const s=fresh();try{
    s.saveSelectedRun('FLEET-001','fleet',forecastFixture('oil',now,'current'),config);
    s.saveSelectedRun('FLEET-003','fleet',forecastFixture('tyres',now),config);
    const d=s.getSnapshot('fleet',config),current=warningRecords(d).current;
    assert.ok(isCurrentCondition(current[0].warning));const forecastIndex=current.findIndex(r=>r.warning.attentionKind==='forecast');assert.ok(forecastIndex>0);
    assert.ok(current.slice(0,forecastIndex).every(r=>isCurrentCondition(r.warning)));
    const rows=fleetRows(d);assert.equal(fleetStatus(rows.find(r=>r.vehicle.id==='FLEET-001')!).label,'Current condition');
    assert.equal(selectFleetRows(rows,'all','','attention').at(-1)!.vehicle.id,'FLEET-003');
    const plan=s.saveServiceRecord('FLEET-001','fleet','plan',{planId:'current-first',description:'Constructed planning check',periodStart:now,maintenanceAt:'2026-10-05T09:00:00Z',timeZone:'Europe/Athens',plannedDistanceKm:900,forecastId:'fixture',forecastRevision:1,issuedAt:now,validUntil:'2026-11-01T09:00:00Z',source:'Constructed fixture',reference:'Fictional reference',eligible:true,remainingDistanceKm:1200,dataOrigin:'constructed fixture'},config);
    assert.equal(plan.plans[0].result!.status,'current warning');
  }finally{s.close();}
});
test('stable, withheld and beyond-horizon evaluations replace earlier alerts without becoming current warnings',()=>{
  const s=fresh();try{
    const original=s.saveSelectedRun('FLEET-001','fleet',forecastFixture('tyres',now),config)[0];
    const task=s.createAction({vehicleId:'FLEET-001',warningId:original.warningId,actorProfile:'fleet',task:'Retained synthetic inspection',assignedTo:'Coordinator'});
    for(const variant of ['stable','missing','stale']){
      s.saveSelectedRun('FLEET-001','fleet',forecastFixture('tyres',now,variant),config);
      const v=s.getSnapshot('fleet',config).vehicles.find(v=>v.id==='FLEET-001')!;
      assert.ok(!v.warnings.some(w=>w.sourceType==='selected_forecast'&&w.current));assert.equal(v.actions.find(a=>a.id===task)!.warningId,original.warningId);assert.doesNotMatch(warningOrigin(v.warnings.find(w=>w.id===original.warningId)!).label,/Current/);
    }
    const input=forecastFixture('tyres',now);input.horizon=1;s.saveSelectedRun('FLEET-001','fleet',input,config);
    assert.ok(!s.getSnapshot('fleet',config).vehicles[0].warnings.some(w=>w.sourceType==='selected_forecast'&&w.current));
  }finally{s.close();}
});
test('wheel histories remain independent and a later source replaces the same wheel decision',()=>{
  const s=fresh();try{
    const left=forecastFixture('tyres',now,'current'),right=forecastFixture('tyres',now);right.points.forEach(p=>p.wheelPosition='front right');
    const first=s.saveSelectedRun('FLEET-001','fleet',left,config)[0];s.saveSelectedRun('FLEET-001','fleet',right,config);
    assert.equal(s.getSnapshot('fleet',config).vehicles[0].warnings.filter(w=>w.sourceType==='selected_forecast'&&w.current).length,2);
    const stable=forecastFixture('tyres',now,'stable');stable.evidenceReference='new source contract';s.saveSelectedRun('FLEET-001','fleet',stable,config);
    const v=s.getSnapshot('fleet',config).vehicles[0];assert.equal(v.warnings.find(w=>w.id===first.warningId)!.current,false);
    assert.equal(v.warnings.filter(w=>w.sourceType==='selected_forecast'&&w.current).length,1);assert.equal(v.warnings.find(w=>w.sourceType==='selected_forecast'&&w.current)!.selectedEvidence!.wheelPosition,'front right');
  }finally{s.close();}
});
test('saved assessments age safely, do not revive old alerts, and retain immutable results',()=>{
  const s=fresh();try{
    const run=s.saveSelectedRun('OWNER-001','owner',forecastFixture('oil',now,'current'),config)[0];
    s.updateConfig({assessmentTime:'2026-11-06T09:00:00Z',observationMaxAgeHours:48},config);
    const w=s.getSnapshot('owner',config).vehicles[0].warnings.find(w=>w.id===run.warningId)!;assert.equal(w.current,false);assert.match(w.selectedEvidence!.statusReason,/Assessment changed/);
    assert.deepEqual(s.getSelectedRuns('OWNER-001','owner')[0].result,run.result);
    assert.equal(selectedWarningState({...run,superseded:false},'2026-11-06T09:00:00Z').current,false);
  }finally{s.close();}
});
test('capacity outlook alerts only when the declared reference is approached; charging stays distinct',()=>{
  const s=fresh();try{
    setTestPowertrain(s,'OWNER-001','Electric');
    let run=s.saveSelectedRun('OWNER-001','owner',forecastFixture('battery',now),config)[0];assert.equal(s.getSnapshot('owner',config).vehicles[0].warnings.find(w=>w.id===run.warningId)!.current,false);
    const battery=forecastFixture('battery',now);battery.reference=97;run=s.saveSelectedRun('OWNER-001','owner',battery,config)[0];const w=s.getSnapshot('owner',config).vehicles[0].warnings.find(w=>w.id===run.warningId)!;assert.equal(w.current,true);assert.equal(w.attentionKind,'forecast');
    run=s.saveSelectedRun('OWNER-001','owner',forecastFixture('charging',now),config)[0];assert.equal(s.getSnapshot('owner',config).vehicles[0].warnings.find(w=>w.id===run.warningId)!.current,false);
    run=s.saveSelectedRun('OWNER-001','owner',forecastFixture('charging',now,'late'),config)[0];assert.equal(s.getSnapshot('owner',config).vehicles[0].warnings.find(w=>w.id===run.warningId)!.attentionKind,'forecast');
  }finally{s.close();}
});
test('a failed warning write cannot archive an existing current condition',()=>{
  const s=fresh();try{const before=s.saveSelectedRun('FLEET-001','fleet',forecastFixture('oil',now,'current'),config)[0];assert.throws(()=>s.saveSelectedRun('FLEET-001','fleet',forecastFixture('oil',now),config,true),/failure/);const w=s.getSnapshot('fleet',config).vehicles[0].warnings.find(w=>w.id===before.warningId)!;assert.equal(w.current,true);assert.equal(s.getSelectedRuns('FLEET-001','fleet').length,1);}finally{s.close();}
});
test('explicit re-evaluation can select an existing fixture without rewriting evidence; failed selection rolls back',()=>{
  const s=fresh();try{
    const input=forecastFixture('oil',now,'current'),original=s.saveSelectedRun('FLEET-001','fleet',input,config)[0];
    s.saveSelectedRun('FLEET-001','fleet',forecastFixture('oil',now),config);
    assert.equal(s.getSnapshot('fleet',config).vehicles[0].warnings.find(w=>w.id===original.warningId)!.current,false);
    assert.throws(()=>s.saveSelectedRun('FLEET-001','fleet',input,config,true),/failure/);
    assert.equal(s.getSnapshot('fleet',config).vehicles[0].warnings.find(w=>w.id===original.warningId)!.current,false);
    const selected=s.saveSelectedRun('FLEET-001','fleet',input,config).find(r=>r.id===original.id)!;
    assert.equal(selected.superseded,false);assert.equal(selected.selectionHistory!.length,2);assert.deepEqual(selected.input,original.input);assert.deepEqual(selected.result,original.result);assert.equal(s.getSelectedRuns('FLEET-001','fleet').length,2);
    assert.equal(s.getSnapshot('fleet',config).vehicles[0].warnings.find(w=>w.id===original.warningId)!.current,true);
  }finally{s.close();}
});
test('journey fixtures retain ordered timestamps, endpoints, history and bounded trace distance',()=>{
  const trips=constructedOwnerJourneys('OWNER-001','2026-10-04T07:50:00Z'),visible=journeyHistory([...trips].reverse(),now);
  assert.equal(visible[0].id,trips[0].id);assert.equal(visible.length,3);assert.equal((Date.parse(visible[0].endedAt)-Date.parse(visible[0].startedAt))/60000,40);
  for(const trip of trips){assert.equal(trip.dataOrigin,'constructed fixture');assert.equal(trip.points.length,33);assert.equal(trip.points[0].recordedAt,trip.startedAt);assert.equal(trip.points.at(-1)!.recordedAt,trip.endedAt);assert.ok(trip.points.every((p,k)=>k===0||Date.parse(p.recordedAt)>Date.parse(trip.points[k-1].recordedAt)));assert.ok(journeyDistanceKm(trip.points)>3&&journeyDistanceKm(trip.points)<8);}
  assert.equal(visible[0].points.at(-1)!.latitude,37.9924);assert.equal(visible[0].points.at(-1)!.longitude,23.7691);
  assert.equal(journeyHistory(trips,'2026-10-03T12:00:00Z').length,2);assert.equal(journeyHistory(trips,'2026-10-01T00:00:00Z').length,0);
});
test('journey seeding is idempotent, owner-only, preserves existing records and exports exact evidence',()=>{
  const s=fresh();try{const before=s.getDashboard('owner')[0];s.seedOwnerJourneys();s.seedOwnerJourneys();const after=s.getDashboard('owner')[0];assert.equal(after.journeys!.length,3);assert.deepEqual(after.observations,before.observations);assert.deepEqual(after.details,before.details);assert.deepEqual(after.actions,before.actions);assert.ok(s.getDashboard('fleet').every(v=>!v.journeys!.length));const report=buildEvidenceReport(s,'owner',config);assert.deepEqual(report.vehicles[0].journeys,after.journeys);assert.match(evidenceCsv(report),/"journey"/);}finally{s.close();}
});
test('journey seed transaction rolls back partial history and can be retried',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maintend-journey-fail-')),filename=path.join(dir,'test.sqlite'),s=new Store(filename,root),db=new DatabaseSync(filename);
  try{s.seed();db.exec("CREATE TRIGGER fail_trip BEFORE INSERT ON vehicle_journeys WHEN NEW.id LIKE '%-1' BEGIN SELECT RAISE(FAIL,'test trip storage failure');END;");assert.throws(()=>s.seedOwnerJourneys());assert.equal(s.getDashboard('owner')[0].journeys!.length,0);db.exec('DROP TRIGGER fail_trip');s.seedOwnerJourneys();assert.equal(s.getDashboard('owner')[0].journeys!.length,3);}finally{db.close();s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('exact warning evidence endpoint scopes vehicle and profile',async()=>{
  const s=fresh(),server=createApiServer(s,config,root);const run=s.saveSelectedRun('OWNER-001','owner',forecastFixture('oil',now,'current'),config)[0];await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try{const response=await fetch(`${url}/api/vehicles/OWNER-001/selected-forecasts/${run.id}?profile=owner`);assert.equal(response.status,200);assert.deepEqual(await response.json(),run);assert.equal((await fetch(`${url}/api/vehicles/OWNER-001/selected-forecasts/${run.id}?profile=fleet`)).status,400);assert.equal((await fetch(`${url}/api/vehicles/FLEET-001/selected-forecasts/${run.id}?profile=fleet`)).status,404);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));s.close();}
});
test('real server restart retains owner route and current warning evidence/action links for both profiles',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maintend-warning-restart-'));let child:ReturnType<typeof spawn>|undefined;
  async function start(){child=spawn(process.execPath,['backend/src/server.ts'],{cwd:root,env:{...process.env,PORT:'0',DB_PATH:path.join(dir,'mvp.sqlite'),EVALUATION_DB_PATH:path.join(dir,'evaluations.sqlite')},stdio:['ignore','pipe','pipe'],windowsHide:true});return new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timed out')),15000);let output='';child!.stdout!.on('data',chunk=>{output+=String(chunk);const m=output.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`);}});child!.once('error',error=>{clearTimeout(timer);reject(error);});});}
  async function stop(){if(child&&child.exitCode===null){const closed=once(child,'exit');child.kill();await closed;}}
  try{let url=await start();const saved:any[]=[];for(const [profile,id] of [['owner','OWNER-001'],['fleet','FLEET-001']] as const){const response=await fetch(`${url}/api/vehicles/${id}/selected-forecasts?profile=${profile}`,{method:'POST',body:JSON.stringify({input:forecastFixture('oil',now,'current')})});assert.equal(response.status,201);const [run]=await response.json();const action=await fetch(`${url}/api/actions`,{method:'POST',body:JSON.stringify({vehicleId:id,warningId:run.warningId,actorProfile:profile,task:'Current concern follow-up',assignedTo:profile==='fleet'?'Coordinator':undefined})});assert.equal(action.status,201);saved.push({profile,id,run,vehicle:(await(await fetch(`${url}/api/dashboard?profile=${profile}`)).json()).vehicles.find((v:any)=>v.id===id)});}await stop();url=await start();for(const record of saved){const v=(await(await fetch(`${url}/api/dashboard?profile=${record.profile}`)).json()).vehicles.find((v:any)=>v.id===record.id);assert.deepEqual(v,record.vehicle);assert.equal(v.warnings.find((w:any)=>w.id===record.run.warningId).current,true);if(record.profile==='owner')assert.equal(v.journeys.length,3);}}finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
