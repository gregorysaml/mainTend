import type { ScenarioConfig, Vehicle } from '../../../../shared/types.ts';
import { measurementAge, measurementSeries } from '../../utils/measurements.ts';
import { formatUtc } from '../../utils/date.ts';
import { Icon } from '../Icon.tsx';
import { Badge } from '../ui/badge.tsx';
export function ReadingCard({ vehicle, configuration, parameter, title }: { vehicle: Vehicle; configuration: ScenarioConfig; parameter: string; title: string }) {
  const series = measurementSeries(vehicle.observations, parameter), reading = series.at(-1);
  const age = reading ? measurementAge(reading, configuration) : null;
  const values = series.slice(-12), low = Math.min(...values.map(r => r.value)), high = Math.max(...values.map(r => r.value));
  const points = values.map((r, i) => `${8 + (i / Math.max(1, values.length - 1)) * 184},${38 - ((r.value - low) / Math.max(.1, high - low)) * 24}`).join(' ');
  return <section className="dashboard-card reading-card"><div className="card-heading"><span className="section-kicker">RECORDED READING</span><Icon name="activity" /></div><h3>{title}</h3><p className="metric-value">{reading?.value ?? '—'} <span>{reading?.unit}</span></p>
    <svg className="reading-sparkline" viewBox="0 0 200 48" role="img" aria-label={`${title}: ${values.length} recorded measurements, not a prediction`}><path d="M8 43H192" stroke="var(--line)" /><polyline points={points} fill="none" stroke="var(--action)" strokeWidth="2" /></svg>
    <Badge tone={age === 'Within age limit' ? 'success' : 'neutral'}>{age ?? 'No recorded reading'}</Badge><p className="panel-note">{reading ? formatUtc(reading.observedAt) : 'Missing data is not assumed normal.'}</p><small className="reading-source">Demo readings · not live sensors</small>
  </section>;
}
