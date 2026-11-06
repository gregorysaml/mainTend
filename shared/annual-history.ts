import type { ForecastInput, ForecastPoint } from './forecast.ts';

export const annualHistoryVersion = 'annual-constructed-v1';
export interface AnnualSeries {
  id: string;
  label: string;
  input: ForecastInput;
}
export interface AnnualHistory {
  version: string;
  vehicleId: string;
  periodStart: string;
  periodEnd: string;
  dataOrigin: 'constructed fixture';
  description: string;
  series: AnnualSeries[];
  unavailable: { label: string; reason: string }[];
}
export interface StoredAnnualHistory extends AnnualHistory { createdAt: string; inputSha256: string }

const dayMs = 86_400_000;
const round = (value: number, decimals = 4) => Number(value.toFixed(decimals));

/** Deterministic constructed histories. These are not reconstructed vehicle records. */
export function annualHistory(vehicleId: string, fuelType: string, assessmentTime: string): AnnualHistory {
  const end = new Date(assessmentTime);
  if (!Number.isFinite(end.getTime())) throw new Error('Annual history needs a valid assessment time.');
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  // Clamp 29 February to 28 February in a non-leap year.
  if (start.getUTCMonth() !== end.getUTCMonth()) start.setUTCDate(0);
  const days = Math.round((end.getTime() - start.getTime()) / dayMs);
  const at = (day: number) => new Date(start.getTime() + day * dayMs).toISOString();
  const variation = [...vehicleId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 7;
  const dailyKm = vehicleId.startsWith('OWNER') ? 45 : 90 + variation * 3;
  const distances = [30_000 + variation * 1000];
  for (let d = 1; d <= days; d++) distances.push(round(distances[d-1] + dailyKm + 8 * Math.sin(d * 0.4), 3));
  const base = (functionId: ForecastInput['functionId']): ForecastInput => ({
    functionId, source: 'MainTend constructed one-year dataset — no live OBD/OEM data',
    evidenceReference: `${annualHistoryVersion}/${vehicleId}`, configurationVersion: annualHistoryVersion,
    dataOrigin: 'constructed fixture', signalMeaning: 'per-wheel pressure', unit: 'bar', xUnit: 'day',
    reference: 2.2, referenceSource: 'Fictional fixture planning reference, not a manufacturer recommendation',
    horizon: 45, policy: { minPoints: 14, minSpan: 14, minR2: 0.9, maxAgeHours: 48, maxStepResidual: 0.02, uncertainty: 0.03 },
    segment: '', points: [], events: []
  });
  const point = (input: ForecastInput, d: number, segment: string, value: number, x: number): ForecastPoint => ({
    id: `${annualHistoryVersion}/${vehicleId}/${input.functionId}/${d}`, observedAt: at(d), receivedAt: at(d),
    value: round(value), x, segment, context: `Constructed comparable ${input.functionId} protocol`,
    contextEvidence: 'Generated fixture context only; not independently verified acquisition evidence'
  });
  const series: AnnualSeries[] = [];
  for (const [wheel, position] of ['front left','front right','rear left','rear right'].entries()) {
    const input = base('tyres');
    for (let d = 0; d <= days; d++) {
      const cycle = Math.floor(d / 80), elapsed = d % 80;
      if (elapsed === 0) input.events!.push({type:'inflation', observedAt:new Date(Date.parse(at(d))-1000).toISOString(), evidence:`Constructed inflation boundary ${cycle + 1}; not a reported real intervention`});
      // Occasional genuine gaps in this fixture; no interpolated observations are saved.
      if (d > 0 && d < days && (d + wheel) % 37 === 0) continue;
      const rate = wheel === 0 ? 0.005 + variation * 0.00005 : 0.001 + wheel * 0.00015;
      const p = point(input,d,`wheel-${wheel}-inflation-${cycle}`,2.55 - rate * elapsed + 0.003 * Math.sin(d * 0.7 + wheel),d);
      p.id += `/${wheel}`; p.wheelPosition = position; input.points.push(p);
    }
    input.segment = input.points.at(-1)!.segment;
    series.push({id:`tyres-${wheel}`, label:`Tyre pressure · ${position}`, input});
  }
  const combustion = /diesel|petrol|gasoline|hybrid/i.test(fuelType);
  const unavailable: AnnualHistory['unavailable'] = [];
  if (combustion) {
    const input = base('oil');
    Object.assign(input, {signalMeaning:'condition/usage-based oil-life', unit:'%', xUnit:'km', reference:20, horizon:12_000,
      policy:{minPoints:20,minSpan:500,minR2:0.95,maxAgeHours:48,maxStepResidual:0.25,uncertainty:2}});
    for (let d = 0; d <= days; d++) {
      const cycle = Math.floor(d / 140), first = cycle * 140;
      if (d === first) input.events!.push({type:'oil service',observedAt:new Date(Date.parse(at(d))-1000).toISOString(),evidence:`Constructed service and reset cycle ${cycle + 1}; no change to the vehicle's reported service book`});
      if (d > 0 && d < days && d % 41 === 0) continue;
      input.points.push(point(input,d,`oil-cycle-${cycle}`,Math.min(100,100 - (distances[d] - distances[first]) * 0.006 + 0.06 * Math.sin(d)),distances[d]));
    }
    input.segment = input.points.at(-1)!.segment;
    series.push({id:'oil',label:'Oil life · separate service cycles',input});
  } else unavailable.push({label:'Oil service',reason:'No combustion-engine oil-life history is generated for this powertrain.'});
  if (/diesel/i.test(fuelType)) {
    const input = base('dpf');
    Object.assign(input,{signalMeaning:'post-regeneration differential pressure',unit:'kPa',xUnit:'km',reference:24,horizon:500,
      dpfContextPolicy:{maxFlowDifference:1,maxTemperatureDifference:5},policy:{minPoints:4,minSpan:500,minR2:0.9,maxAgeHours:48,maxStepResidual:0.2,uncertainty:0.3}});
    const cleaningDay = 300;
    input.events = [{type:'cleaning',observedAt:new Date(Date.parse(at(cleaningDay))-1000).toISOString(),evidence:'Constructed DPF cleaning boundary; not a confirmed maintenance outcome'}];
    // Post-regeneration snapshots, rather than invented daily regeneration events.
    const sampleDays = new Set([0,days,cleaningDay]);
    for (let d = 14; d < days; d += 14) sampleDays.add(d);
    for (const d of [...sampleDays].sort((a,b)=>a-b)) {
      const after = d >= cleaningDay, since = distances[d] - distances[after ? cleaningDay : 0];
      const p = point(input,d,after?'dpf-after-cleaning':'dpf-before-cleaning',5 + since * (after ? 0.0025 : 0.0004) + 0.04 * Math.sin(d),distances[d]);
      Object.assign(p,{regenerationEvidence:`Constructed completed regeneration at ${at(d)}`,exhaustFlow:30 + 0.2 * Math.sin(d),exhaustTemperature:300 + Math.sin(d)});
      input.points.push(p);
    }
    input.segment=input.points.at(-1)!.segment;
    series.push({id:'dpf',label:'DPF · comparable post-regeneration snapshots',input});
  } else unavailable.push({label:'DPF inspection',reason:'No diesel DPF data are invented for this vehicle configuration.'});
  unavailable.push({label:'EV battery health & charging',reason:'These demo vehicles have no established EV traction-battery or charging history. A year of SoC or auxiliary voltage cannot substitute for capacity and session data.'});
  return {version:annualHistoryVersion,vehicleId,periodStart:start.toISOString(),periodEnd:end.toISOString(),dataOrigin:'constructed fixture',
    description:'One calendar year of deterministic synthetic observations. Inflation, oil service and DPF cleaning separate forecast segments. Missing days remain missing. All references and acquisition conditions are fictional assumptions; original measurements and reported service records are unchanged.',series,unavailable};
}
