import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import { evaluationPlan, executeCase, runEvaluation } from '../backend/src/evaluation/runner.ts';
import { EvaluationRepository, evaluationCsv, summarizeRun } from '../backend/src/evaluation/repository.ts';
import { createApiServer } from '../backend/src/http/app.ts';
import type { EvaluationRun } from '../shared/evaluation.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/scenario.json'), 'utf8'));

test('isolated fleet and owner evaluation scenarios execute with reproducible expected results', () => {
  for (const profile of ['fleet', 'owner'] as const) {
    const plan = evaluationPlan(root, profile);
    const run = runEvaluation(root, profile);
    assert.equal(run.inputSha256, plan.inputSha256);
    assert.match(run.inputSha256, /^[a-f0-9]{64}$/);
    assert.equal(run.cases.length, profile === 'fleet' ? 11 : 10);
    assert.ok(run.cases.every(c => c.status === 'pass'), JSON.stringify(run.cases.filter(c => c.status !== 'pass')));
    assert.ok(run.sources.every(s => /^[a-f0-9]{64}$/.test(s.sha256)));
    assert.ok(plan.cases.every(c => !Object.hasOwn(c, 'observe')));
    const second = runEvaluation(root, profile);
    assert.notEqual(second.id, run.id);
    assert.equal(second.inputSha256, run.inputSha256);
    assert.deepEqual(second.cases.map(c => c.observed), run.cases.map(c => c.observed));
    assert.ok(run.limitations.some(l => l.includes('not predictive accuracy')));
  }
});

test('mismatches and execution errors cannot appear as passes', () => {
  const definition = { id: 'probe', title: 'Probe', chapter: 'test', objective: 'Compare independently specified values', input: { n: 1 }, expected: { n: 2 } };
  assert.equal(executeCase({ ...definition, observe: () => ({ n: 1 }) }).status, 'fail');
  const failed = executeCase({ ...definition, observe: () => { throw new Error('Execution failed'); } });
  assert.equal(failed.status, 'error');
  assert.deepEqual(failed.observed, { executionError: 'Execution failed' });
});

test('running evaluations leaves a separate vehicle store and its settings unchanged', () => {
  const live = new Store(':memory:', root);
  try {
    live.seed(); live.getSnapshot('fleet', config);
    const before = { fleet: live.getDashboard('fleet'), owner: live.getDashboard('owner'), settings: live.getConfig(config), history: live.getConfigurationHistory() };
    runEvaluation(root, 'fleet'); runEvaluation(root, 'owner');
    assert.deepEqual({ fleet: live.getDashboard('fleet'), owner: live.getDashboard('owner'), settings: live.getConfig(config), history: live.getConfigurationHistory() }, before);
  } finally { live.close(); }
});

test('evaluation reports and append-only notes persist, without overwriting automated observations', () => {
  const filename = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'maintend-evaluations-')), 'evaluations.sqlite');
  const repo = new EvaluationRepository(filename);
  const run = runEvaluation(root, 'owner');
  repo.save(run);
  const originalCases = structuredClone(run.cases);
  repo.addNote(run.id, 'owner', 'Reviewer checked the synthetic inputs.');
  repo.addNote(run.id, 'owner', 'Second note.');
  assert.throws(() => repo.addNote(run.id, 'owner', ''), /1–2000/);
  assert.throws(() => repo.addNote(run.id, 'owner', 'x'.repeat(2001)), /1–2000/);
  assert.throws(() => repo.addNote(run.id, 'fleet', 'Wrong profile'), /not found/);
  assert.equal(repo.get(run.id, 'fleet'), null);
  repo.close();
  const reopened = new EvaluationRepository(filename);
  try {
    const saved = reopened.get(run.id, 'owner')!;
    assert.equal(saved.notes.length, 2);
    assert.deepEqual(saved.cases, originalCases);
    assert.equal(reopened.list('owner')[0].noteCount, 2);
    assert.equal(summarizeRun(saved).passed, 10);
    assert.deepEqual(reopened.list('fleet'), []);
    assert.throws(() => reopened.save(run));
  } finally { reopened.close(); }
});

test('CSV includes input/expected/observed metadata and reviewer notes with safe escaping', () => {
  const run = runEvaluation(root, 'fleet');
  run.notes.push({ text: 'A note, with "quotes"\nand a new line', savedAt: new Date().toISOString() });
  run.cases[0].title = '=FORMULA()';
  const csv = evaluationCsv(run);
  assert.equal(csv[0], '\uFEFF');
  assert.ok(csv.includes('inputJson'));
  assert.ok(csv.includes('expectedJson'));
  assert.ok(csv.includes('observedJson'));
  assert.ok(csv.includes('reviewerNote'));
  assert.ok(csv.includes("\"'=FORMULA()\""));
  assert.ok(csv.includes(run.inputSha256));
  assert.ok(csv.endsWith('\r\n'));
});

test('HTTP evaluation plan, execution, history, review and downloads are scoped and isolated', async () => {
  const live = new Store(':memory:', root); live.seed();
  const repo = new EvaluationRepository(':memory:');
  const server = createApiServer(live, config, root, repo);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const before = await (await fetch(base + '/api/dashboard?profile=fleet')).json();
    const plan = await fetch(base + '/api/evaluations/plan?profile=owner'); assert.equal(plan.status, 200);
    assert.equal((await plan.json()).cases.length, 10);
    const response = await fetch(base + '/api/evaluations', { method: 'POST', body: JSON.stringify({ profile: 'fleet' }) });
    assert.equal(response.status, 201);
    const run: EvaluationRun = await response.json();
    assert.equal(run.cases.length, 11);
    assert.equal((await (await fetch(base + '/api/evaluations?profile=fleet')).json()).length, 1);
    assert.equal((await (await fetch(base + '/api/evaluations?profile=owner')).json()).length, 0);
    assert.equal((await fetch(base + `/api/evaluations/${run.id}?profile=owner`)).status, 404);
    const note = await fetch(base + `/api/evaluations/${run.id}/notes?profile=fleet`, { method: 'POST', body: JSON.stringify({ text: 'Browser review pending.' }) });
    assert.equal(note.status, 200); assert.equal((await note.json()).notes.length, 1);
    for (const format of ['json', 'csv']) {
      const download = await fetch(base + `/api/evaluations/${run.id}/export?profile=fleet&format=${format}`);
      assert.equal(download.status, 200);
      assert.match(download.headers.get('content-disposition')!, /attachment; filename="maintend-evaluation-/);
      assert.ok((await download.text()).includes(run.id));
    }
    for (const input of [{ profile: 'other' }, { profile: 'fleet', cases: [] }, null, []]) assert.equal((await fetch(base + '/api/evaluations', { method: 'POST', body: JSON.stringify(input) })).status, 400);
    assert.equal((await fetch(base + '/api/evaluations?profile=invalid')).status, 400);
    assert.equal((await fetch(base + `/api/evaluations/${run.id}/export?profile=fleet&format=pdf`)).status, 400);
    assert.equal((await fetch(base + `/api/evaluations/${run.id}/notes?profile=fleet`, { method: 'POST', body: JSON.stringify({ text: '', cases: [] }) })).status, 400);
    assert.deepEqual(await (await fetch(base + '/api/dashboard?profile=fleet')).json(), before);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    live.close(); repo.close();
  }
});
