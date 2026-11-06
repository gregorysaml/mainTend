import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {Store} from '../lib/store.mjs';
import {forecastFixture} from '../shared/forecast-fixtures.ts';
import {functionApplicability} from '../shared/capabilities.ts';
import type {ObservationEntry,FunctionSourceSettings} from '../shared/capabilities.ts';
import {createApiServer} from '../backend/src/http/app.ts';
import {buildEvidenceReport,evidenceCsv} from '../backend/src/evidence/report.ts';
import {setTestPowertrain} from './fixture-configuration.ts';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config=JSON.parse(fs.readFileSync(path.join(root,'config/scenario.json'),'utf8'));
const now=config.assessmentTime,at=(hours:number)=>new Date(Date.parse(now)+hours*3600000).toISOString();
function setup(){const s=new Store(':memory:',root);s.seed();s.seedAnnualHistories(config);s.seedCapabilitySupport(config);return s;}
const card=(s:Store,id='OWNER-001',profile:'owner'|'fleet'='owner')=>s.getCapabilityCard(id,profile,config);
const fn=(s:Store,name:string,id='OWNER-001',profile:'owner'|'fleet'='owner')=>card(s,id,profile).functions.find(f=>f.functionId===name)!;
const source=(s:Store,name:'oil'|'tyres'|'dpf',change:Partial<FunctionSourceSettings>,id='OWNER-001',profile:'owner'|'fleet'='owner')=>s.saveFunctionSource(id,profile,{...fn(s,name,id,profile).settings,...change,note:'Isolated acceptance test'});
const observation=(change:Partial<ObservationEntry>={}):ObservationEntry=>({functionId:'tyres',recordId:'test-record',observedAt:at(0.01),source:'Constructed test observation',dataOrigin:'constructed fixture',value:240,unit:'kPa',wheelPosition:'front left',context:'same stored protocol',event:'none',...change});
const advance=(s:Store,hours:number)=>s.updateConfig({assessmentTime:at(hours),observationMaxAgeHours:48},config);

test('SR3 derives all five functions from the exact vehicle, never real verified coverage',()=>{
  const s=setup();try{
    const owner=card(s),diesel=card(s,'FLEET-001','fleet');
    assert.equal(owner.functions.length,5);assert.equal(diesel.functions.length,5);
    assert.deepEqual(owner.functions.filter(f=>f.supportStatus==='supported').map(f=>f.functionId),['tyres','oil']);
    assert.deepEqual(diesel.functions.filter(f=>f.supportStatus==='supported').map(f=>f.functionId),['tyres','oil','dpf']);
    for(const f of owner.functions.filter(f=>f.supportStatus==='supported')){assert.equal(f.supportLabel,'Supported in demonstration only');assert.equal(f.readiness,'ready');assert.ok(f.evidenceReference);}
    assert.equal(fn(s,'battery').applicability,'not applicable');assert.equal(fn(s,'charging').canEvaluate,false);
    assert.ok(Date.parse(owner.checkedAt)>Date.parse(owner.assessedAt));assert.deepEqual(card(s),owner);
    assert.equal(s.getCapabilityHistory('OWNER-001','owner').cards.length,1);
  }finally{s.close();}
});

test('SR3 applicability distinguishes BEV, plug-in, non-plug-in, diesel and unknown configurations',()=>{
  assert.equal(functionApplicability('Electric','oil').status,'not applicable');
  assert.equal(functionApplicability('Electric','battery').status,'applicable');
  assert.equal(functionApplicability('PHEV','charging').status,'applicable');
  assert.equal(functionApplicability('Petrol Hybrid','charging').status,'not applicable');
  assert.equal(functionApplicability('Diesel Hybrid','dpf').status,'applicable');
  assert.equal(functionApplicability('Unknown','oil').status,'awaiting verification');
  const s=setup();try{setTestPowertrain(s,'OWNER-001','Electric');const c=card(s);assert.equal(c.functions.find(f=>f.functionId==='oil')!.supportStatus,'not applicable');assert.equal(c.functions.find(f=>f.functionId==='battery')!.supportStatus,'awaiting verification');assert.equal(c.functions.find(f=>f.functionId==='battery')!.readiness,'unavailable');}finally{s.close();}
});

test('U04 automatic mixed support cannot be overridden by a manual ready entry',()=>{
  const s=setup();try{
    source(s,'tyres',{mode:'unverified'},'FLEET-001','fleet');source(s,'dpf',{mode:'unsupported'},'FLEET-001','fleet');
    s.saveServiceRecord('FLEET-001','fleet','capability',{functionId:'tyres',supportStatus:'supported',readinessStatus:'ready',configurationVersion:'manual claim',source:'Constructed fixture',evidenceReference:'Unverified legacy claim',checkedAt:now,reason:'Claimed ready',nextStep:'Review',dataOrigin:'constructed fixture'},config);
    const c=card(s,'FLEET-001','fleet');assert.deepEqual(c.functions.map(f=>f.supportStatus),['awaiting verification','supported','unsupported','not applicable','not applicable']);
    assert.equal(c.functions[0].canEvaluate,false);assert.equal(c.functions[0].evidenceReference,undefined);
    assert.equal(s.getServiceRecords('FLEET-001','fleet').capabilities.length,1);
  }finally{s.close();}
});

test('U04 new tyre segment changes just one wheel to insufficient history',()=>{
  const s=setup();try{
    const support=fn(s,'tyres').supportCheckedAt;advance(s,1);
    s.addFunctionObservation('OWNER-001','owner',observation({event:'inflation'}),config);
    const f=fn(s,'tyres');assert.equal(f.supportStatus,'supported');assert.equal(f.supportCheckedAt,support);assert.equal(f.readiness,'partial');
    assert.equal(f.channels.find(c=>c.label.includes('front left'))!.status,'insufficient history');assert.equal(f.channels.filter(c=>c.status==='ready').length,3);
    assert.throws(()=>s.evaluateFunction('OWNER-001','owner','tyres','tyres-0',config),/at least/);
    assert.ok(s.evaluateFunction('OWNER-001','owner','tyres','tyres-1',config).length);
  }finally{s.close();}
});

test('U05 feed interruption, permission loss and restoration retain configuration support',()=>{
  const s=setup();try{
    const original=fn(s,'oil');
    for(const feed of ['paused','permission missing'] as const){source(s,'oil',{feed});const f=fn(s,'oil');assert.equal(f.readiness,'missing');assert.equal(f.supportStatus,'supported');assert.equal(f.supportCheckedAt,original.supportCheckedAt);assert.throws(()=>s.evaluateFunction('OWNER-001','owner','oil','oil',config),/paused|permission/);}
    source(s,'oil',{feed:'available'});assert.equal(fn(s,'oil').readiness,'ready');
    assert.ok(s.getCapabilityHistory('OWNER-001','owner').cards.length>=4);
  }finally{s.close();}
});

test('U05 stale data become current only after a newer comparable observation',()=>{
  const s=setup();try{
    const before=fn(s,'oil'),last=s.getFunctionInputs('OWNER-001','owner','oil',config)[0].input.points.at(-1)!;
    advance(s,72);assert.equal(fn(s,'oil').readiness,'stale');assert.equal(fn(s,'oil').supportStatus,'supported');
    s.addFunctionObservation('OWNER-001','owner',observation({functionId:'oil',recordId:'new-oil',observedAt:at(72),value:last.value-0.6,unit:'%',odometer:last.x+100,odometerUnit:'km',wheelPosition:undefined}),config);
    const current=fn(s,'oil');assert.equal(current.readiness,'ready');assert.equal(current.supportCheckedAt,before.supportCheckedAt);assert.equal(current.latestAt,at(72));
  }finally{s.close();}
});

test('SR3 configuration change invalidates bindings, active estimates and direct evaluation',()=>{
  const s=setup();try{
    const run=s.evaluateFunction('OWNER-001','owner','oil','oil',config)[0];
    (s as any).db.prepare('UPDATE vehicle_details SET model_year=model_year+1 WHERE vehicle_id=?').run('OWNER-001');
    const f=fn(s,'oil');assert.equal(f.supportStatus,'awaiting verification');assert.equal(f.canEvaluate,false);assert.equal(f.evidenceReference,undefined);
    assert.throws(()=>s.saveSelectedRun('OWNER-001','owner',forecastFixture('oil',now),config),/configuration changed/);
    assert.equal(s.getSnapshot('owner',config).vehicles[0].warnings.find(w=>w.id===run.warningId)!.current,false);
    s.seedCapabilitySupport(config);assert.equal(fn(s,'oil').supportStatus,'awaiting verification');
  }finally{s.close();}
});

test('U06 complete disclosures refresh changes in both profiles and failed refresh confirms nothing',()=>{
  const s=setup();try{
    for(const [id,profile] of [['OWNER-001','owner'],['FLEET-001','fleet']] as const){
      const first=s.discloseCapabilities(id,profile,'Before purchase',config);assert.equal(first.card.functions.length,5);
      source(s,'oil',{mode:'unsupported'},id,profile);
      const second=s.discloseCapabilities(id,profile,'Before proposed payment',config);assert.ok(second.changes.some(c=>c.includes('Oil service: unsupported')));
      assert.equal(first.card.functions.find(f=>f.functionId==='oil')!.supportStatus,'supported');
      assert.throws(()=>s.discloseCapabilities(id,profile,'During use',config,true),/verification is incomplete/);
      assert.throws(()=>s.getCapabilityCard(id,profile,config,true),/verification is incomplete/);
      assert.equal(s.getCapabilityHistory(id,profile).disclosures.length,2);
    }
  }finally{s.close();}
});

test('Daily observations preserve raw units and source IDs with idempotence, validation and rollback',()=>{
  const s=setup();try{
    const input=observation();assert.throws(()=>s.addFunctionObservation('OWNER-001','owner',input,config,true),/not saved/);assert.equal(s.getFunctionObservationEvidence('OWNER-001','owner').length,0);
    s.addFunctionObservation('OWNER-001','owner',input,config);assert.equal(s.addFunctionObservation('OWNER-001','owner',input,config).duplicate,true);
    assert.throws(()=>s.addFunctionObservation('OWNER-001','owner',{...input,value:250},config),/different evidence/);
    const e=s.getFunctionObservationEvidence('OWNER-001','owner')[0] as any;assert.equal(e.raw.value,240);assert.equal(e.raw.unit,'kPa');assert.equal(e.canonical.value,2.4);assert.ok(Date.parse(e.importedAt)>Date.parse(e.observedAt));
    assert.throws(()=>s.addFunctionObservation('OWNER-001','owner',observation({recordId:'bad-unit',unit:'unknown'}),config),/units/);
    assert.throws(()=>s.addFunctionObservation('OWNER-001','owner',observation({recordId:'bad-time',observedAt:'2026-02-30T09:00:00Z'}),config),/time/);
    assert.throws(()=>s.addFunctionObservation('OWNER-001','owner',observation({functionId:'dpf',recordId:'wrong-engine'}),config),/not applicable/);
    assert.equal(s.getFunctionObservationEvidence('OWNER-001','owner').length,1);
  }finally{s.close();}
});

test('Manual source observations never verify support or mix with the demonstration history',()=>{
  const s=setup();try{
    source(s,'tyres',{mode:'unverified'});s.addFunctionObservation('OWNER-001','owner',observation({dataOrigin:'unverified user entry'}),config);
    assert.equal(fn(s,'tyres').supportStatus,'awaiting verification');assert.equal(fn(s,'tyres').readiness,'unavailable');
    assert.equal(s.getFunctionInputs('OWNER-001','owner','tyres',config).flatMap(s=>s.input.points).length,1);
    const before=fn(s,'oil').settings;assert.throws(()=>s.saveFunctionSource('OWNER-001','owner',{...before,feed:'paused'},true),/retained/);assert.deepEqual(fn(s,'oil').settings,before);
  }finally{s.close();}
});

test('Restart seeding cannot promote an unverified source into a demonstration support binding',()=>{
  const s=setup();try{
    setTestPowertrain(s,'OWNER-001','Electric');
    const settings={...fn(s,'battery').settings,mode:'unverified',note:'Isolated manual source test'};
    s.saveFunctionSource('OWNER-001','owner',settings);
    s.addFunctionObservation('OWNER-001','owner',observation({functionId:'battery',dataOrigin:'unverified user entry',value:98,unit:'%',batteryId:'manual-pack',chemistry:'NMC',ageDays:100,chargeThroughput:200,temperatureContext:'20–25 C'}),config);
    s.seedCapabilitySupport(config);
    s.saveFunctionSource('OWNER-001','owner',{...settings,mode:'demo'});
    assert.equal(fn(s,'battery').supportStatus,'awaiting verification');assert.equal(fn(s,'battery').canEvaluate,false);
  }finally{s.close();}
});

test('Everyday planning resolves a current saved source and rejects invented, foreign or changed estimates',()=>{
  const s=setup();try{
    const run=s.evaluateFunction('OWNER-001','owner','oil','oil',config)[0];
    const draft={forecastRunId:run.id,description:'Constructed next journey',periodStart:now,maintenanceAt:at(72),timeZone:'Europe/Athens',plannedDistanceKm:900,remainingDistanceKm:999999};
    const saved=s.saveDailyPlan('OWNER-001','owner',draft,config).plans[0];assert.equal(saved.input.forecastId,`SELECTED:${run.id}`);assert.equal(saved.input.remainingDistanceKm,run.result.crossingAfter);assert.equal(saved.input.validityKind,'freshness at comparison');assert.ok(Date.parse(saved.savedAt)>Date.parse(now));
    assert.notEqual(saved.result!.status,'unavailable');
    const constrained=s.saveDailyPlan('OWNER-001','owner',{...draft,manufacturerDistanceKm:800},config).plans[0];assert.equal(constrained.result!.status,'manufacturer limit');
    assert.throws(()=>s.saveDailyPlan('OWNER-001','owner',{...draft,forecastRunId:999999},config),/missing/);
    assert.throws(()=>s.saveDailyPlan('FLEET-001','fleet',draft,config),/missing/);
    source(s,'oil',{source:'Changed demonstration source'});assert.throws(()=>s.saveDailyPlan('OWNER-001','owner',draft,config),/changed since/);
    assert.equal(s.getServiceRecords('OWNER-001','owner').plans.length,2);
  }finally{s.close();}
});

test('Evidence includes automatic cards, source history, disclosures and raw observations in its hash',()=>{
  const s=setup();try{
    const first=buildEvidenceReport(s,'owner',config);assert.equal(first.capabilityCards!['OWNER-001'].functions.length,5);
    assert.equal(buildEvidenceReport(s,'owner',config).inputSha256,first.inputSha256);
    source(s,'oil',{feed:'paused'});const changed=buildEvidenceReport(s,'owner',config);assert.notEqual(changed.inputSha256,first.inputSha256);
    s.addFunctionObservation('OWNER-001','owner',observation(),config);s.discloseCapabilities('OWNER-001','owner','During use',config);
    const report=buildEvidenceReport(s,'owner',config);assert.notEqual(report.inputSha256,changed.inputSha256);assert.equal(report.functionObservations!['OWNER-001'].length,1);
    for(const type of ['capability_card','capability_history','function_observation'])assert.ok(evidenceCsv(report).includes(type));
  }finally{s.close();}
});

test('HTTP per-vehicle applicability cannot be bypassed and everyday endpoints enforce profile and failures',async()=>{
  const s=setup(),server=createApiServer(s,config,root);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;
  const base=`http://127.0.0.1:${port}/api/vehicles/OWNER-001`;
  const post=(path:string,body:unknown)=>fetch(`${base}/${path}?profile=owner`,{method:'POST',body:JSON.stringify(body)});
  try{
    for(const name of ['battery','charging','dpf'] as const){const r=await post('selected-forecasts',{input:forecastFixture(name,now)});assert.equal(r.status,400);assert.match((await r.json()).error,/not applicable/);}
    assert.equal((await fetch(`${base}/capabilities?profile=fleet`)).status,400);
    assert.equal((await post('capabilities/observations',{input:observation(),simulateFailure:true})).status,400);
    assert.equal(s.getFunctionObservationEvidence('OWNER-001','owner').length,0);
    assert.equal((await post('capabilities/disclose',{stage:'Before proposed payment',simulateFailure:true})).status,400);
    assert.equal(s.getCapabilityHistory('OWNER-001','owner').disclosures.length,0);
    const r=await post('capabilities/evaluate',{functionId:'oil',channelId:'oil'});assert.equal(r.status,201);
    assert.equal((await post('capabilities/disclose',{stage:'Before purchase'})).status,201);
    setTestPowertrain(s,'OWNER-001','Electric');assert.equal((await post('selected-forecasts',{input:forecastFixture('oil',now)})).status,400);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));s.close();}
});

test('U05/U06 real process restart retains exact status history, raw observations and disclosures in both profiles',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maintend-capabilities-restart-'));let child:ReturnType<typeof spawn>|undefined;
  async function start(){
    child=spawn(process.execPath,['backend/src/server.ts'],{cwd:root,env:{...process.env,PORT:'0',DB_PATH:path.join(dir,'mvp.sqlite'),EVALUATION_DB_PATH:path.join(dir,'eval.sqlite')},stdio:['ignore','pipe','pipe'],windowsHide:true});
    return new Promise<string>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Startup timed out')),15000);let out='';child!.stdout!.on('data',chunk=>{out+=chunk;const m=out.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timeout);resolve(`http://127.0.0.1:${m[1]}`);}});child!.once('error',e=>{clearTimeout(timeout);reject(e);});child!.once('exit',code=>{clearTimeout(timeout);if(!out.includes('MVP running'))reject(new Error(`Process exited ${code}`));});});
  }
  async function stop(){if(child&&child.exitCode===null){const exit=once(child,'exit');child.kill();await exit;}}
  try{
    let base=await start();const saved:any[]=[];
    for(const [id,profile] of [['OWNER-001','owner'],['FLEET-001','fleet']]){
      const url=`${base}/api/vehicles/${id}/capabilities`,q=`?profile=${profile}`,post=(kind:string,body:unknown)=>fetch(`${url}/${kind}${q}`,{method:'POST',body:JSON.stringify(body)});
      const initial=await (await fetch(url+q)).json();
      assert.equal((await post('observations',{input:observation({recordId:`restart-${id}`})})).status,201);
      assert.equal((await post('source',{input:{...initial.functions.find((f:any)=>f.functionId==='oil').settings,feed:'paused',note:'Interrupted test feed'}})).status,200);
      assert.equal((await post('disclose',{stage:'Before proposed payment'})).status,201);
      const report=await (await fetch(`${base}/api/evidence?profile=${profile}&format=json`)).json();
      saved.push({id,profile,card:await (await fetch(url+q)).json(),history:await (await fetch(`${url}/history${q}`)).json(),observations:report.functionObservations[id]});
    }
    await stop();base=await start();
    for(const old of saved){
      const url=`${base}/api/vehicles/${old.id}/capabilities`,q=`?profile=${old.profile}`;
      assert.deepEqual(await (await fetch(url+q)).json(),old.card);assert.deepEqual(await (await fetch(`${url}/history${q}`)).json(),old.history);
      const report=await (await fetch(`${base}/api/evidence?profile=${old.profile}&format=json`)).json();assert.deepEqual(report.functionObservations[old.id],old.observations);
      assert.equal(report.capabilityCards[old.id].functions.find((f:any)=>f.functionId==='oil').readiness,'missing');
    }
  }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
