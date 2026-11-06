import { Button } from './ui/button.tsx';
import { useEffect, useState, type ChangeEvent } from 'react';
import type { ImportResult, ImportSchema, Vehicle } from '../../../shared/types.ts';
import { api } from '../api/client.ts';
import './import-data.css';

export function ImportData({ vehicles, reload }: { vehicles: Vehicle[]; reload: () => Promise<void> }) {
  const [schema, setSchema] = useState<ImportSchema | null>(null);
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || '');
  const [parameter, setParameter] = useState('engine_coolant_temperature');
  const [value, setValue] = useState('203');
  const [unit, setUnit] = useState('°F');
  const [observedAt, setObservedAt] = useState('2026-10-04T08:30:00Z');
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [json, setJson] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [reviewedInput, setReviewedInput] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api.importSchema().then(setSchema).catch(e => setError(e instanceof Error ? e.message : 'Could not load import configuration')); }, []);
  function invalidate() { setResult(null); setReviewedInput(null); setSaved(false); setError(''); }
  function payload(): unknown {
    if (mode === 'batch') {
      try { return JSON.parse(json); }
      catch { throw new Error('Invalid JSON. Provide an array of observation objects; your input has been retained.'); }
    }
    return [{ vehicleId, parameter, value: value.trim() === '' ? null : Number(value), unit, observedAt }];
  }
  async function preview() {
    setBusy(true); setError(''); setSaved(false); setResult(null); setReviewedInput(null);
    try { const input = payload(); setResult(await api.previewImport(input)); setReviewedInput(input); }
    catch (e) { setError(e instanceof Error ? e.message : 'Preview failed'); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError('');
    try { setResult(await api.importObservations(reviewedInput)); setSaved(true); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Your entered values are retained for retry.'); }
    finally { setBusy(false); }
  }
  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    invalidate();
    if (file.size > 1_000_000) { setError('Choose a JSON file smaller than 1 MB'); return; }
    try { setJson(await file.text()); } catch { setError('Could not read the file. Try selecting it again.'); }
  }
  function sample() {
    if (!schema) return;
    invalidate(); setJson(JSON.stringify(schema.example.map(row => ({ ...row, vehicleId: vehicles[0]?.id || row.vehicleId })), null, 2));
  }
  return <section className="import-panel">
    <div className="section-title"><div><span className="section-kicker">OBSERVATION INGESTION</span><h2>Import observations</h2></div></div>
    <p>Review unit conversions before saving. Accepted rows are stored; rejected rows are listed with reasons. Missing measurements are never replaced with normal values.</p>
    <p>For tyre pressure, oil-life and DPF measurements, use the <a href={`#service?vehicle=${encodeURIComponent(vehicleId)}`}>maintenance observation forms</a>. They retain source evidence, wheel identity and intervention history.</p>
    {schema && <p className="muted">Assessment time: {schema.assessmentTime}. Older and future-dated observations may be stored but remain unsuitable for this fixed-time assessment.</p>}
    <div className="import-modes" role="group" aria-label="Import mode"><Button variant="secondary" disabled={busy} aria-pressed={mode === 'single'} onClick={() => { invalidate(); setMode('single'); }}>Single observation</Button><Button variant="secondary" disabled={busy} aria-pressed={mode === 'batch'} onClick={() => { invalidate(); setMode('batch'); }}>JSON batch</Button></div>
    <fieldset disabled={busy} className="import-fields"><legend>{mode === 'single' ? 'Measurement details' : 'Batch input'}</legend>
      {mode === 'single' ? <div className="measurement-grid">
        <label>Vehicle<select value={vehicleId} onChange={e => { invalidate(); setVehicleId(e.target.value); }}>{vehicles.map(v => <option key={v.id} value={v.id}>{v.id} · {v.displayName}</option>)}</select></label>
        <label>Parameter<select value={parameter} onChange={e => { invalidate(); setParameter(e.target.value); setUnit(schema?.parameters[e.target.value].unit || 'V'); }}>{Object.entries(schema?.parameters || {}).map(([key, def]) => <option key={key} value={key}>{def.label}</option>)}</select></label>
        <label>Value<input type="number" step="any" value={value} onChange={e => { invalidate(); setValue(e.target.value); }} /></label>
        <label>Input unit<select value={unit} onChange={e => { invalidate(); setUnit(e.target.value); }}>{schema?.parameters[parameter]?.acceptedUnits.map(u => <option key={u}>{u}</option>)}</select></label>
        <label className="timestamp-field">Observation time (ISO with timezone)<input value={observedAt} onChange={e => { invalidate(); setObservedAt(e.target.value); }} placeholder="2026-10-04T08:30:00Z" /></label>
      </div> : <><div className="batch-tools"><Button type="button" onClick={sample} disabled={!schema}>Load conversion example</Button><label>Open JSON file<input type="file" accept=".json,application/json" onChange={readFile} /></label></div><label>JSON records<textarea rows={12} spellCheck={false} value={json} onChange={e => { invalidate(); setJson(e.target.value); }} placeholder="Paste an array of observations" /></label></>}
    </fieldset>
    <div className="import-controls"><Button disabled={busy || !schema} onClick={preview}>{busy ? 'Processing…' : 'Preview & validate'}</Button><Button disabled={busy || !result || saved || !result.accepted.length} onClick={save}>Save accepted observations</Button></div>
    {error && <p role="alert" className="error">{error}</p>}
    {result && <div aria-live="polite"><p className={saved ? 'import-success' : ''}><strong>{saved ? 'Saved' : 'Preview — no records saved'}:</strong> {result.accepted.length} accepted · {result.rejected.length} rejected.</p>
      {saved && <p>Vehicle assessments will use these observations on your next visit to Overview or Vehicles. Importing the same batch again creates additional observations.</p>}
      <div className="import-result-list">{result.accepted.map(row => <article className="import-row" key={row.rowNumber}><span className="badge ok">Row {row.rowNumber} · {saved ? 'Saved' : 'Accepted'}</span><h3>{row.vehicleId} · {schema?.parameters[row.parameter]?.label || row.parameter}</h3><p><strong>Original:</strong> {row.source.value} {row.source.unit} → <strong>Stored value:</strong> {row.value} {row.unit}</p><p>{row.source.conversion}</p><small>Observation time: {row.observedAt}</small></article>)}
      {result.rejected.map(row => <article className="import-row rejected" key={row.rowNumber}><span className="badge warning">Row {row.rowNumber} · Rejected</span><p>{row.reason}</p><pre>{JSON.stringify(row.record, null, 2)}</pre></article>)}</div>
    </div>}
    {schema && <details><summary>Supported units & API</summary><p>Temperature: °C/C/celsius, °F/F/fahrenheit, K/kelvin → °C. Voltage: V/volt/volts, mV/millivolt/millivolts → V. Units are trimmed and matched without case sensitivity.</p><p><code>GET /api/import/schema</code> · <code>POST /api/import/preview</code> · <code>POST /api/import</code></p><p>Both POST endpoints accept a JSON array with vehicleId, parameter, numeric value, unit and observedAt. Maximum {schema.maxRecords} records per batch.</p></details>}
  </section>;
}
