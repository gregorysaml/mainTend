import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { Store } from '../../../lib/store.mjs';
import type { CreateActionInput, Profile, ScenarioConfig, UpdateActionInput } from '../../../shared/types.ts';
import type { ActionScheduleInput } from '../../../shared/maintenance.ts';
import { maxImportRecords, parameterDictionary } from '../imports/normalization.ts';
import { buildEvidenceReport, evidenceCsv } from '../evidence/report.ts';
import { evaluationPlan, runEvaluation } from '../evaluation/runner.ts';
import { EvaluationRepository, evaluationCsv } from '../evaluation/repository.ts';

const contentTypes: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' };
function send(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}
async function readBody(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 1_000_000) throw new Error('Payload too large');
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new Error('Invalid JSON'); }
}

export function createApiServer(store: Store, config: ScenarioConfig, projectRoot: string, evaluations?: EvaluationRepository) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const capabilityMatch=url.pathname.match(/^\/api\/vehicles\/([^/]+)\/capabilities(?:\/(history|disclose|source|observations|evaluate|inputs|plan))?$/);
      if(capabilityMatch){
        const id=decodeURIComponent(capabilityMatch[1]),profile=url.searchParams.get('profile');if(profile!=='fleet'&&profile!=='owner')throw new Error('Profile must be fleet or owner.');
        const kind=capabilityMatch[2];
        if(req.method==='GET'){
          if(!kind)return send(res,200,store.getCapabilityCard(id,profile,config));
          if(kind==='history')return send(res,200,store.getCapabilityHistory(id,profile));
          if(kind==='inputs'){const fn=url.searchParams.get('function');if(!['tyres','oil','dpf','battery','charging'].includes(fn??''))throw new Error('Select a function.');return send(res,200,store.getFunctionInputs(id,profile,fn as import('../../../shared/service.ts').ServiceFunction,config));}
        }
        if(req.method==='POST'){
          const body=await readBody(req) as {input?:any;stage?:unknown;functionId?:any;channelId?:unknown;simulateFailure?:boolean};if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Provide a structured form entry.');
          const fail=body.simulateFailure===true;
          if(kind==='disclose')return send(res,201,store.discloseCapabilities(id,profile,body.stage,config,fail));
          if(kind==='source'){store.saveFunctionSource(id,profile,body.input,fail);return send(res,200,{ok:true});}
          if(kind==='observations')return send(res,201,store.addFunctionObservation(id,profile,body.input,config,fail));
          if(kind==='evaluate')return send(res,201,store.evaluateFunction(id,profile,body.functionId,body.channelId,config,fail));
          if(kind==='plan')return send(res,201,store.saveDailyPlan(id,profile,body.input,config,fail));
        }
      }
      const annualMatch=url.pathname.match(/^\/api\/vehicles\/([^/]+)\/annual-history(?:\/(evaluate))?$/);
      if(annualMatch){
        const vehicleId=decodeURIComponent(annualMatch[1]),profile=url.searchParams.get('profile');
        if(profile!=='fleet'&&profile!=='owner')throw new Error('Profile must be fleet or owner.');
        if(req.method==='GET'&&!annualMatch[2])return send(res,200,store.getAnnualHistory(vehicleId,profile));
        if(req.method==='POST'&&annualMatch[2]){
          const body=await readBody(req) as {seriesId?:unknown;simulateFailure?:boolean}|null;
          if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Select a stored series.');
          return send(res,201,store.evaluateAnnualHistory(vehicleId,profile,body.seriesId,config,body.simulateFailure===true));
        }
      }
      const selectedMatch=url.pathname.match(/^\/api\/vehicles\/([^/]+)\/selected-forecasts(?:\/(\d+))?$/);
      if(selectedMatch){
        const vehicleId=decodeURIComponent(selectedMatch[1]),profile=url.searchParams.get('profile');
        if(profile!=='fleet'&&profile!=='owner')throw new Error('Profile must be fleet or owner.');
        if(req.method==='GET'){
          const runs=store.getSelectedRuns(vehicleId,profile);
          if(selectedMatch[2]){const run=runs.find(r=>r.id===Number(selectedMatch[2]));return run?send(res,200,run):send(res,404,{error:'Snapshot not found for selected vehicle.'});}
          return send(res,200,runs);
        }
        if(req.method==='POST'&&!selectedMatch[2]){const body=await readBody(req) as {input:import('../../../shared/forecast.ts').ForecastInput;simulateFailure?:boolean};if(!body)throw new Error('Input is required.');return send(res,201,store.saveSelectedRun(vehicleId,profile,body.input,config,body.simulateFailure===true));}
      }
      const serviceMatch = url.pathname.match(/^\/api\/vehicles\/([^/]+)\/service(?:\/(capability|plan|disclosure))?$/);
      if (serviceMatch) {
        const vehicleId = decodeURIComponent(serviceMatch[1]);
        const profile = url.searchParams.get('profile');
        if (profile !== 'fleet' && profile !== 'owner') throw new Error('Profile must be fleet or owner.');
        if (req.method === 'GET' && !serviceMatch[2]) return send(res,200,store.getServiceRecords(vehicleId,profile));
        if (req.method === 'POST' && serviceMatch[2]) {
          const body = await readBody(req) as {input: unknown; simulateFailure?: boolean};
          if (!body || typeof body !== 'object') throw new Error('Record is required.');
          return send(res,201,store.saveServiceRecord(vehicleId,profile,serviceMatch[2],body.input,config,body.simulateFailure === true));
        }
      }
      if (url.pathname === '/api/evaluations' || url.pathname.startsWith('/api/evaluations/')) {
        if (!evaluations) return send(res, 503, { error: 'Evaluation storage is unavailable.' });
        const parseProfile = (value: unknown): Profile => {
          if (value !== 'fleet' && value !== 'owner') throw new Error('Profile must be fleet or owner');
          return value;
        };
        if (req.method === 'GET' && url.pathname === '/api/evaluations/plan') return send(res, 200, evaluationPlan(projectRoot, parseProfile(url.searchParams.get('profile'))));
        if (req.method === 'GET' && url.pathname === '/api/evaluations') return send(res, 200, evaluations.list(parseProfile(url.searchParams.get('profile'))));
        if (req.method === 'POST' && url.pathname === '/api/evaluations') {
          const body = await readBody(req) as Record<string, unknown> | null;
          if (!body || Array.isArray(body) || Object.keys(body).some(key => key !== 'profile')) throw new Error('Provide only the selected profile.');
          const run = runEvaluation(projectRoot, parseProfile(body.profile));
          evaluations.save(run);
          return send(res, 201, run);
        }
        const evaluation = url.pathname.match(/^\/api\/evaluations\/([a-f0-9-]{36})(?:\/(notes|export))?$/);
        if (evaluation) {
          const profile = parseProfile(url.searchParams.get('profile'));
          if (req.method === 'POST' && evaluation[2] === 'notes') {
            const body = await readBody(req) as Record<string, unknown> | null;
            if (!body || Array.isArray(body) || Object.keys(body).some(key => key !== 'text')) throw new Error('Provide only the reviewer note text.');
            if (!evaluations.get(evaluation[1], profile)) return send(res, 404, { error: 'Run not found for this profile.' });
            return send(res, 200, evaluations.addNote(evaluation[1], profile, body.text));
          }
          if (req.method === 'GET') {
            const run = evaluations.get(evaluation[1], profile);
            if (!run) return send(res, 404, { error: 'Run not found for this profile.' });
            if (evaluation[2] === 'export') {
              const format = url.searchParams.get('format');
              if (format !== 'json' && format !== 'csv') throw new Error('Export format must be json or csv.');
              res.writeHead(200, { 'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="maintend-evaluation-${run.id}.${format}"`, 'cache-control': 'no-store' });
              return res.end(format === 'csv' ? evaluationCsv(run) : JSON.stringify(run, null, 2));
            }
            if (!evaluation[2]) return send(res, 200, run);
          }
        }
        return send(res, 404, { error: 'Evaluation route not found.' });
      }
      if (req.method === 'GET' && url.pathname === '/api/config') return send(res, 200, { ...store.getConfig(config), note: 'Shared demonstration settings; not validated diagnostic limits.' });
      if (req.method === 'POST' && url.pathname === '/api/cooling/runs') return send(res, 201, store.runCooling(await readBody(req), config));
      if (req.method === 'POST' && url.pathname === '/api/lubrication/runs') return send(res, 201, store.runLubrication(await readBody(req), config));
      const lubricationRead = url.pathname.match(/^\/api\/lubrication\/runs\/([a-f0-9-]{36})\/read$/);
      if (req.method === 'POST' && lubricationRead) {
        const body = await readBody(req) as Record<string, unknown> | null;
        if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'profile')) throw new Error('Provide only the selected profile.');
        store.readLubricationNotification(lubricationRead[1], body.profile); return send(res, 200, { ok: true });
      }
      const coolingRead = url.pathname.match(/^\/api\/cooling\/runs\/([a-f0-9-]{36})\/read$/);
      if (req.method === 'POST' && coolingRead) {
        const body = await readBody(req) as Record<string, unknown> | null;
        if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'profile')) throw new Error('Provide only the selected profile.');
        store.readCoolingNotification(coolingRead[1], body.profile); return send(res, 200, { ok: true });
      }
      if (req.method === 'PATCH' && url.pathname === '/api/config') return send(res, 200, store.updateConfig(await readBody(req), config));
      if (req.method === 'GET' && url.pathname === '/api/dashboard') {
        const profile = (url.searchParams.get('profile') || 'fleet') as Profile;
        if (!['fleet', 'owner'].includes(profile)) return send(res, 400, { error: 'Profile must be fleet or owner' });
        return send(res, 200, store.getSnapshot(profile, config));
      }
      const vehicleProfile = url.pathname.match(/^\/api\/vehicles\/([A-Za-z0-9-]+)\/profile$/);
      if (req.method === 'PATCH' && vehicleProfile) { store.updateVehicleProfile(vehicleProfile[1], await readBody(req)); return send(res, 200, { ok: true }); }
      if (req.method === 'GET' && url.pathname === '/api/evidence') {
        const profile = (url.searchParams.get('profile') || 'fleet') as Profile;
        const format = url.searchParams.get('format') || 'json';
        if (!['fleet', 'owner'].includes(profile) || !['json', 'csv'].includes(format)) return send(res, 400, { error: 'Use profile=fleet/owner and format=json/csv' });
        const report = buildEvidenceReport(store, profile, config);
        res.writeHead(200, { 'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="evidence-${profile}.${format}"`, 'cache-control': 'no-store' });
        return res.end(format === 'csv' ? evidenceCsv(report) : JSON.stringify(report, null, 2));
      }
      if (req.method === 'GET' && url.pathname === '/api/import/schema') return send(res, 200, {
        parameters: parameterDictionary, maxRecords: maxImportRecords, assessmentTime: store.getConfig(config).assessmentTime,
        example: [
          { vehicleId: 'FLEET-001', parameter: 'engine_coolant_temperature', value: 203, unit: '°F', observedAt: '2026-10-04T08:30:00Z' },
          { vehicleId: 'FLEET-001', parameter: 'battery_voltage', value: 12600, unit: 'mV', observedAt: '2026-10-04T08:30:00Z' }
        ]
      });
      if (req.method === 'POST' && url.pathname === '/api/import/preview') return send(res, 200, store.previewImport(await readBody(req)));
      if (req.method === 'POST' && url.pathname === '/api/import') {
        const result = store.importObservations(await readBody(req));
        // Assessment is read on the next dashboard request, after the batch commits.
        return send(res, 200, result);
      }
      if (req.method === 'POST' && url.pathname === '/api/assess') { const saved = store.getConfig(config); return send(res, 200, { assessmentTime: saved.assessmentTime, results: store.assess(saved) }); }
      if (req.method === 'POST' && url.pathname === '/api/actions') {
        const input = await readBody(req) as CreateActionInput;
        if (input.simulateFailure) throw new Error('Simulated storage failure; your entered values were not cleared. Please retry.');
        return send(res, 201, { id: store.createAction(input) });
      }
      const match = url.pathname.match(/^\/api\/actions\/(\d+)$/);
      const inspectionMatch = url.pathname.match(/^\/api\/actions\/(\d+)\/inspections$/);
      if (req.method === 'POST' && inspectionMatch) return send(res, 201, { id: store.recordInspection(Number(inspectionMatch[1]), await readBody(req)) });
      const scheduleMatch = url.pathname.match(/^\/api\/actions\/(\d+)\/schedule$/);
      if (req.method === 'PATCH' && scheduleMatch) { store.updateActionSchedule(Number(scheduleMatch[1]), await readBody(req) as ActionScheduleInput); return send(res, 200, { ok: true }); }
      if (req.method === 'PATCH' && match) { store.updateAction(Number(match[1]), await readBody(req) as UpdateActionInput); return send(res, 200, { ok: true }); }
      if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'API route not found' });
      const staticRoot = path.join(projectRoot, 'dist');
      const file = path.resolve(staticRoot, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
      if (!file.startsWith(staticRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'content-type': contentTypes[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    } catch (error) { send(res, 400, { error: error instanceof Error ? error.message : 'Request failed' }); }
  });
}
