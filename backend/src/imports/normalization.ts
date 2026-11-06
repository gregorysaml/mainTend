import type { ImportParameter, ImportResult, ObservationInput, ObservationSource } from '../../../shared/types.ts';

export const maxImportRecords = 500;
export const parameterDictionary: Record<string, ImportParameter> = {
  engine_coolant_temperature: { unit: '°C', min: -50, max: 180, label: 'Engine coolant temperature', acceptedUnits: ['°C', 'C', 'celsius', '°F', 'F', 'fahrenheit', 'K', 'kelvin'] },
  battery_voltage: { unit: 'V', min: 0, max: 30, label: 'Battery voltage', acceptedUnits: ['V', 'volt', 'volts', 'mV', 'millivolt', 'millivolts'] }
};

type NormalizationResult = { observation: ObservationInput; source: ObservationSource } | { reason: string };

// Require an unambiguous ISO timestamp with a timezone; reject calendar overflow.
export function isoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, , zone] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (+month < 1 || +month > 12 || +day < 1 || +day > days || +hour > 23 || +minute > 59 || +second > 59) return null;
  if (zone !== 'Z' && (+zone.slice(1, 3) > 23 || +zone.slice(4, 6) > 59)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function normalizeObservation(raw: unknown, vehicleIds: Set<string>): NormalizationResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { reason: 'Each record must be a JSON object' };
  const record = raw as Record<string, unknown>;
  const required = ['vehicleId', 'parameter', 'value', 'unit', 'observedAt'];
  const missing = required.filter(key => record[key] === undefined || record[key] === null || record[key] === '');
  if (missing.length) return { reason: `Missing required field(s): ${missing.join(', ')}` };
  if (typeof record.vehicleId !== 'string' || !vehicleIds.has(record.vehicleId)) return { reason: `Unknown vehicle: ${String(record.vehicleId)}` };
  const definition = typeof record.parameter === 'string' && Object.hasOwn(parameterDictionary, record.parameter) ? parameterDictionary[record.parameter] : undefined;
  if (!definition) return { reason: `Unsupported parameter: ${String(record.parameter)}` };
  if (typeof record.value !== 'number' || !Number.isFinite(record.value)) return { reason: 'Value must be a finite number' };
  if (typeof record.unit !== 'string') return { reason: 'Unit must be a string' };
  const unit = record.unit.trim().toLowerCase();
  if (!definition.acceptedUnits.some(accepted => accepted.toLowerCase() === unit)) return { reason: `Unsupported unit for ${record.parameter}: ${record.unit}. Accepted units: ${definition.acceptedUnits.join(', ')}` };
  let value = record.value;
  let conversion = `Identity: stored in ${definition.unit}`;
  if (record.parameter === 'engine_coolant_temperature' && ['°f', 'f', 'fahrenheit'].includes(unit)) {
    value = (value - 32) * 5 / 9;
    conversion = '°C = (°F − 32) × 5/9';
  } else if (record.parameter === 'engine_coolant_temperature' && ['k', 'kelvin'].includes(unit)) {
    value -= 273.15;
    conversion = '°C = K − 273.15';
  } else if (record.parameter === 'battery_voltage' && ['mv', 'millivolt', 'millivolts'].includes(unit)) {
    value /= 1000;
    conversion = 'V = mV / 1000';
  }
  if (value < definition.min || value > definition.max) return { reason: `Converted value ${value} ${definition.unit} outside accepted import range ${definition.min}–${definition.max} ${definition.unit}` };
  const observedAt = isoTimestamp(record.observedAt);
  if (!observedAt) return { reason: 'observedAt must be a valid ISO date-time with timezone (e.g. 2026-10-04T08:30:00Z)' };
  return {
    observation: { vehicleId: record.vehicleId, parameter: record.parameter as string, value, unit: definition.unit, observedAt },
    source: { value: record.value, unit: record.unit, observedAt: record.observedAt as string, conversion }
  };
}

export function prepareImport(records: unknown, vehicleIds: Set<string>): ImportResult {
  if (!Array.isArray(records)) throw new Error('Import payload must be an array');
  if (!records.length) throw new Error('Provide at least one observation');
  if (records.length > maxImportRecords) throw new Error(`Maximum ${maxImportRecords} records per import`);
  const result: ImportResult = { accepted: [], rejected: [] };
  records.forEach((record, index) => {
    const normalized = normalizeObservation(record, vehicleIds);
    if ('reason' in normalized) result.rejected.push({ rowNumber: index + 1, record, reason: normalized.reason });
    else result.accepted.push({ ...normalized.observation, source: normalized.source, rowNumber: index + 1 });
  });
  return result;
}
