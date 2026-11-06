import { useEffect, useId, useRef, useState } from 'react';
import type { ScenarioConfig, Vehicle } from '../../../shared/types.ts';
import { measurementAge, measurementSeries } from '../utils/measurements.ts';
import { formatUtc } from '../utils/date.ts';
import './vehicle-evidence.css';

const parameters = [ ['engine_coolant_temperature', 'Coolant temperature'], ['battery_voltage', 'Battery voltage'] ] as const;
const colours = { 'Within age limit': 'var(--action)', Outdated: 'var(--amber)', 'After assessment time': 'var(--text-muted)' };
export function MeasurementHistory({ vehicle, configuration, initialParameter = parameters[0][0] }: { vehicle: Vehicle; configuration: ScenarioConfig; initialParameter?: string }) {
  const [parameter, setParameter] = useState<string>(initialParameter);
  const chartRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(500);
  const chartId = useId();
  const series = measurementSeries(vehicle.observations, parameter);
  useEffect(() => {
    if (!chartRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [series.length]);
  const rule = configuration.rules.find(r => r.parameter === parameter);
  const values = [...series.map(o => o.value), ...(rule ? [rule.threshold] : [])];
  const low = Math.min(...values), high = Math.max(...values);
  const margin = Math.max((high - low) * 0.2, parameter === 'battery_voltage' ? 0.2 : 2);
  const minY = low - margin, maxY = high + margin;
  const firstTime = series.length ? Date.parse(series[0].observedAt) : 0;
  const lastTime = series.length ? Date.parse(series.at(-1)!.observedAt) : 0;
  const right = width - 15, centre = (55 + right) / 2;
  const x = (time: number) => lastTime === firstTime ? centre : 55 + (time - firstTime) / (lastTime - firstTime) * (right - 55);
  const y = (value: number) => 160 - (value - minY) / (maxY - minY) * 125;
  const assessmentMs = Date.parse(configuration.assessmentTime);
  const compactTime = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return <section className="measurement-history" aria-label={`${vehicle.displayName} measurement history`}>
    <div className="panel-heading"><div><span className="section-kicker">RECORDED MEASUREMENTS</span><h3>Measurement history</h3></div><label>Measurement<select value={parameter} onChange={event => setParameter(event.target.value)}>{parameters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    {!series.length ? <p className="muted">No recorded measurements for this parameter. No values are assumed.</p> : <>
      <svg ref={chartRef} className="measurement-chart" viewBox={`0 0 ${width} 215`} role="img" aria-labelledby={`${chartId}-title ${chartId}-description`}>
        <title id={`${chartId}-title`}>{parameters.find(p => p[0] === parameter)?.[1]} history for {vehicle.displayName}</title>
        <desc id={`${chartId}-description`}>{series.length} stored readings in {series[0].unit}, ordered by UTC time. Teal points are within the age limit; amber points are outdated; grey points are after assessment time. The line connects records and is not a forecast. Exact values and age labels are in the table below.</desc>
        {[0, 1, 2, 3].map(i => { const value = minY + (maxY - minY) * i / 3; return <g key={i}><line x1="55" x2={right} y1={y(value)} y2={y(value)} stroke="var(--line)" /><text x="47" y={y(value) + 4} textAnchor="end" fontSize="12" fill="var(--text-muted)">{value.toFixed(1)}</text></g>; })}
        <text x="55" y="18" fontSize="12" fill="var(--text-muted)">{series[0].unit}</text>
        {rule && <><line x1="55" x2={right} y1={y(rule.threshold)} y2={y(rule.threshold)} stroke="var(--amber)" strokeDasharray="5 4" /><text x={right} y={y(rule.threshold) - 6} textAnchor="end" fontSize="11" fill="var(--amber)">Demo threshold {rule.operator} {rule.threshold} {rule.unit}</text></>}
        {series.length > 1 && <polyline points={series.map(o => `${x(Date.parse(o.observedAt))},${y(o.value)}`).join(' ')} fill="none" stroke="var(--action)" strokeWidth="2" />}
        {assessmentMs >= firstTime && assessmentMs <= lastTime && <line x1={x(assessmentMs)} x2={x(assessmentMs)} y1="30" y2="160" stroke="var(--purple)" strokeDasharray="3 4"><title>Assessment time: {formatUtc(configuration.assessmentTime)}</title></line>}
        {series.map(o => <circle key={o.id} cx={x(Date.parse(o.observedAt))} cy={y(o.value)} r="4.5" fill={colours[measurementAge(o, configuration)]} stroke="var(--panel)" strokeWidth="1.5" tabIndex={0} aria-label={`Reading ${o.id}: ${o.value} ${o.unit}, ${formatUtc(o.observedAt)}, ${measurementAge(o, configuration)}`}><title>#{o.id}: {o.value} {o.unit} · {formatUtc(o.observedAt)} · {measurementAge(o, configuration)}{o.source ? ` · Original ${o.source.value} ${o.source.unit}` : ''}</title></circle>)}
        <text x={series.length === 1 ? centre : 55} y="186" textAnchor={series.length === 1 ? 'middle' : 'start'} fontSize="11" fill="var(--text-muted)">{compactTime(series[0].observedAt)}</text>
        {lastTime !== firstTime && <text x={right} y="186" textAnchor="end" fontSize="11" fill="var(--text-muted)">{compactTime(series.at(-1)!.observedAt)}</text>}
        <text x={centre} y="207" textAnchor="middle" fontSize="12" fill="var(--text-muted)">Recorded time · UTC</text>
      </svg>
      <div className="chart-legend"><span className="fresh">● Within age limit</span><span className="old">● Outdated</span><span className="future">● After assessment</span></div>
      <p className="panel-note">{series.length} recorded readings. {series.length === 1 ? 'One reading cannot establish a trend. ' : 'Lines connect stored readings, not predicted values. '}Only the latest eligible reading per parameter is used in assessment; the age limit is {configuration.observationMaxAgeHours} h.</p>
      <details><summary>View exact readings and source units</summary><div className="table-scroll"><table><caption>All {parameters.find(p => p[0] === parameter)?.[1].toLowerCase()} records, oldest first</caption><thead><tr><th>Recorded time (UTC)</th><th>Value</th><th>Data age</th><th>Source</th></tr></thead><tbody>{series.map(o => <tr key={o.id}><td>{formatUtc(o.observedAt)}<small>Record #{o.id}</small></td><td>{o.value} {o.unit}</td><td>{measurementAge(o, configuration)}</td><td>{o.source ? <>{o.source.value} {o.source.unit}<small>{o.source.conversion}</small></> : 'Original source unavailable'}{o.importedAt && <small>Imported: {formatUtc(o.importedAt)}</small>}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}
