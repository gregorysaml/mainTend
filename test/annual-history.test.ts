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
import {annualHistory} from '../shared/annual-history.ts';
import {calculateSelected} from '../backend/src/predictive/selected.ts';
import {createApiServer} from '../backend/src/http/app.ts';
import {buildEvidenceReport,evidenceCsv} from '../backend/src/evidence/report.ts';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config=JSON.parse(fs.readFileSync(path.join(root,'config/scenario.json'),'utf8'));
const assessment=config.assessmentTime;

test('one calendar year, per-wheel identity, physical units, gaps and reproducible data',()=>{
  const h=annualHistory('FLEET-001','Diesel',assessment);
  assert.equal(h.periodStart,'2025-10-04T09:00:00.000Z');assert.equal(h.periodEnd,assessment);
  assert.deepEqual(h,annualHistory('FLEET-001','Diesel',assessment));
  assert.equal(h.series.length,6);assert.equal(h.series.filter(s=>s.input.functionId==='tyres').length,4);
  const ids=new Set<string>();
  for(const s of h.series){
    assert.ok(s.input.points.length>25);
    assert.equal(s.input.points[0].observedAt,h.periodStart);assert.equal(s.input.points.at(-1)!.observedAt,h.periodEnd);
    for(const p of s.input.points){assert.ok(!ids.has(p.id));ids.add(p.id);assert.ok(Date.parse(p.observedAt)<=Date.parse(assessment));assert.ok(Number.isFinite(p.value));}
    const times=s.input.points.map(p=>Date.parse(p.observedAt));assert.ok(times.every((t,k)=>k===0||t>times[k-1]));
  }
  assert.ok(h.series[0].input.points.length<366);assert.ok(h.series[0].input.points.length>350);
  assert.notEqual(h.series[0].input.points.at(-1)!.value,annualHistory('FLEET-002','Diesel',assessment).series[0].input.points.at(-1)!.value);
  assert.equal(annualHistory('OWNER-001','Petrol',assessment).series.length,5);
  assert.ok(!annualHistory('OWNER-001','Petrol',assessment).series.some(s=>['dpf','battery','charging'].includes(s.input.functionId)));
});

test('calendar years include leap days and clamp 29 February correctly',()=>{
  const leap=annualHistory('TEST','Petrol','2024-03-01T12:00:00Z');assert.equal((Date.parse(leap.periodEnd)-Date.parse(leap.periodStart))/86400000,366);
  assert.equal(annualHistory('TEST','Petrol','2024-02-29T12:00:00Z').periodStart,'2023-02-28T12:00:00.000Z');
});

test('annual inputs calculate from the current segment and retain earlier cycles',()=>{
  for(const [id,fuel] of [['FLEET-001','Diesel'],['FLEET-002','Diesel'],['FLEET-003','Diesel'],['OWNER-001','Petrol']]){
    const h=annualHistory(id,fuel,assessment);
    for(const s of h.series){
      const current=s.input.points.filter(p=>p.segment===s.input.segment),r=calculateSelected(s.input,assessment);
      assert.ok(['crossing estimate','beyond horizon','current concern','stable'].includes(r.status),`${id}/${s.id}: ${r.status}: ${r.reason}`);
      assert.ok(current.length<s.input.points.length);assert.ok(current.length>=s.input.policy.minPoints);
      const onlyCurrent=structuredClone(s.input);onlyCurrent.points=current;
      assert.deepEqual(calculateSelected(onlyCurrent,assessment),r,'Earlier cycles must not enter fitting');
      const wrong=structuredClone(s.input);wrong.segment=wrong.points[0].segment;
      assert.equal(calculateSelected(wrong,assessment).status,'withheld','Old cycle cannot be represented as current');
    }
  }
});

test('year-long data do not override freshness, unknown context or maintenance boundaries',()=>{
  const s=annualHistory('FLEET-001','Diesel',assessment).series[0];
  assert.equal(calculateSelected(s.input,'2026-10-07T09:00:00Z').status,'withheld');
  assert.equal(calculateSelected(s.input,'2026-09-01T09:00:00Z').status,'withheld');
  const bad=structuredClone(s.input);bad.points.at(-1)!.context='unknown';assert.equal(calculateSelected(bad,assessment).status,'withheld');
  const crossed=structuredClone(s.input);crossed.events!.push({type:'rotation',observedAt:assessment,evidence:'Constructed unsegmented rotation'});assert.equal(calculateSelected(crossed,assessment).status,'withheld');
});

test('seeding is additive, idempotent, retains source times and rolls back failed writes',()=>{
  const s=new Store(':memory:',root);try{
    s.seed();const before=JSON.stringify(s.getSnapshot('owner',config)),count=s.getSelectedRuns('OWNER-001','owner').length;
    s.seedAnnualHistories(config);const first=s.getAnnualHistory('OWNER-001','owner')!;
    assert.equal(JSON.stringify(s.getSnapshot('owner',config)),before);assert.equal(s.getSelectedRuns('OWNER-001','owner').length,count);
    s.seedAnnualHistories({...config,assessmentTime:'2026-11-05T09:00:00Z'});assert.deepEqual(s.getAnnualHistory('OWNER-001','owner'),first);
    assert.throws(()=>s.evaluateAnnualHistory('OWNER-001','owner','oil',config,true),/failure/);assert.equal(s.getSelectedRuns('OWNER-001','owner').length,0);
    const r=s.evaluateAnnualHistory('OWNER-001','owner','oil',config);assert.equal(r.length,1);
    assert.equal(s.evaluateAnnualHistory('OWNER-001','owner','oil',config).length,1);
    s.evaluateAnnualHistory('OWNER-001','owner','tyres-0',config);s.evaluateAnnualHistory('OWNER-001','owner','tyres-1',config);
    assert.ok(s.getSelectedRuns('OWNER-001','owner').every(r=>!r.superseded),'Different wheels retain independent results');
    assert.throws(()=>s.getAnnualHistory('OWNER-001','fleet'),/profile/);
    const report=buildEvidenceReport(s,'owner',config);assert.deepEqual(report.annualHistories!['OWNER-001'],first);assert.match(evidenceCsv(report),/annual_history/);
  }finally{s.close();}
});

test('annual seed transaction leaves no partial histories when storage fails',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maintend-annual-rollback-')),filename=path.join(dir,'test.sqlite');
  const s=new Store(filename,root),db=new DatabaseSync(filename);
  try{s.seed();db.exec("CREATE TRIGGER fail_annual BEFORE INSERT ON annual_histories WHEN NEW.vehicle_id='FLEET-002' BEGIN SELECT RAISE(FAIL,'test write failure');END;");assert.throws(()=>s.seedAnnualHistories(config));assert.equal(s.getAnnualHistory('FLEET-001','fleet'),null);db.exec('DROP TRIGGER fail_annual');s.seedAnnualHistories(config);assert.ok(s.getAnnualHistory('FLEET-001','fleet'));}
  finally{db.close();s.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('both profiles can retrieve stored annual inputs and save correctly linked follow-up over HTTP',async()=>{
  const s=new Store(':memory:',root);s.seed();s.seedAnnualHistories(config);const server=createApiServer(s,config,root);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const post=(path:string,body:unknown,method='POST')=>fetch(url+path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  try{for(const [profile,id] of [['fleet','FLEET-001'],['owner','OWNER-001']] as const){
    const base=`/api/vehicles/${id}/annual-history`,q=`?profile=${profile}`;
    const h=await (await fetch(url+base+q)).json();assert.equal(h.dataOrigin,'constructed fixture');assert.equal(h.periodStart,'2025-10-04T09:00:00.000Z');
    assert.equal((await post(base+'/evaluate'+q,{seriesId:'oil',simulateFailure:true})).status,400);
    assert.equal((await fetch(url+`/api/vehicles/${id}/selected-forecasts`+q)).status,200);
    const r=await post(base+'/evaluate'+q,{seriesId:'oil'});assert.equal(r.status,201);const [run]=await r.json();assert.equal(run.input.points.length,h.series.find((s:any)=>s.id==='oil').input.points.length);
    const action=await post('/api/actions',{vehicleId:id,actorProfile:profile,warningId:run.warningId,task:'Review annual oil-service estimate',assignedTo:profile==='fleet'?'Demo coordinator':undefined});assert.equal(action.status,201);const {id:actionId}=await action.json();
    assert.equal((await post(`/api/actions/${actionId}`,{status:'completed',note:'Reported completion'},'PATCH')).status,400);
    assert.equal((await post(`/api/actions/${actionId}`,{status:'in progress',note:'Reviewing constructed history'},'PATCH')).status,200);
    assert.equal((await post(`/api/actions/${actionId}`,{status:'completed',note:'Reported work',outcome:'Constructed service recorded; not independent confirmation'},'PATCH')).status,200);
    assert.equal(s.getDashboard(profile).find(v=>v.id===id)!.actions[0].warningId,run.warningId);
    assert.equal((await post(base+'/evaluate'+q,{seriesId:'unknown'})).status,400);
    assert.equal((await fetch(url+base+`?profile=${profile==='owner'?'fleet':'owner'}`)).status,400);
  }}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));s.close();}
});

test('actual server process restart preserves exact year history, results and action links in both profiles',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maintend-annual-restart-'));
  let child:ReturnType<typeof spawn>|undefined;
  async function start(){
    child=spawn(process.execPath,['backend/src/server.ts'],{cwd:root,env:{...process.env,PORT:'0',DB_PATH:path.join(dir,'mvp.sqlite'),EVALUATION_DB_PATH:path.join(dir,'evaluations.sqlite')},stdio:['ignore','pipe','pipe'],windowsHide:true});
    return await new Promise<string>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Local server startup timed out')),15000);
      let output='';child!.stdout!.on('data',chunk=>{output+=chunk.toString();const match=output.match(/http:\/\/localhost:(\d+)/);if(match){clearTimeout(timeout);resolve(`http://127.0.0.1:${match[1]}`);}});
      child!.once('error',error=>{clearTimeout(timeout);reject(error);});child!.once('exit',code=>{clearTimeout(timeout);if(!output.includes('MVP running'))reject(new Error(`Server exited with ${code}`));});
    });
  }
  async function stop(){if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}}
  try{
    let base=await start();const saved:any[]=[];
    for(const [profile,id] of [['fleet','FLEET-001'],['owner','OWNER-001']]){
      const history=await (await fetch(`${base}/api/vehicles/${id}/annual-history?profile=${profile}`)).json();
      const response=await fetch(`${base}/api/vehicles/${id}/annual-history/evaluate?profile=${profile}`,{method:'POST',body:JSON.stringify({seriesId:'tyres-0'})});assert.equal(response.status,201);const runs=await response.json();
      const r=await fetch(`${base}/api/actions`,{method:'POST',body:JSON.stringify({vehicleId:id,actorProfile:profile,warningId:runs[0].warningId,task:'Year-history follow-up',assignedTo:profile==='fleet'?'Coordinator':undefined})});assert.equal(r.status,201);
      const dashboard=await (await fetch(`${base}/api/dashboard?profile=${profile}`)).json();saved.push({profile,id,history,runs,actions:dashboard.vehicles.find((v:any)=>v.id===id).actions});
    }
    await stop();base=await start();
    for(const record of saved){
      assert.deepEqual(await (await fetch(`${base}/api/vehicles/${record.id}/annual-history?profile=${record.profile}`)).json(),record.history);
      assert.deepEqual(await (await fetch(`${base}/api/vehicles/${record.id}/selected-forecasts?profile=${record.profile}`)).json(),record.runs);
      const dashboard=await (await fetch(`${base}/api/dashboard?profile=${record.profile}`)).json();assert.deepEqual(dashboard.vehicles.find((v:any)=>v.id===record.id).actions,record.actions);
    }
  }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
