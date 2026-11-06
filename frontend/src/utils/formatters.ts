import { formatUtc } from './date.ts';
export { formatUtc };
export function formatKilometres(value?: number): string { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `${value.toLocaleString('en-GB')} km` : 'Not recorded'; }
export function formatTemperature(value?: number): string { return typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString('en-GB', { maximumFractionDigits: 2 })} °C` : 'Not recorded'; }
export function formatPressure(value?: number, unit: 'bar' | 'PSI' = 'bar'): string { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `${(unit === 'PSI' ? value * 14.5037738 : value).toLocaleString('en-GB', { maximumFractionDigits: 2 })} ${unit}` : 'Not recorded'; }
