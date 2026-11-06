export const formatUtc=(value:string):string=>new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'})+' UTC';

// Native datetime-local controls omit seconds when they are zero. Interpret
// their wall-clock value explicitly as UTC, never in the browser's timezone.
export function utcInputTimestamp(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00Z` : `${value}Z`;
}
