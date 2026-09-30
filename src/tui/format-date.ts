export function formatHistoryTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// A calendar date, optionally with a time, that names no timezone.
const UNZONED = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?$/;

// A value without a timezone is shown as written: reading it as host-local time
// can move it to the neighbouring day.
export function formatDetailDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const unzoned = UNZONED.exec(value);
  if (unzoned) return unzoned[1];
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

export function formatDetailExpiry(value: string | undefined, now = Date.now()): string | undefined {
  const date = formatDetailDate(value);
  if (!date || !value) return undefined;
  // The day count treats such a value as UTC, as a bare date already is.
  const unzoned = UNZONED.exec(value);
  const timestamp = new Date(unzoned?.[2] ? `${unzoned[1]}T${unzoned[2]}Z` : value).getTime();
  if (!Number.isFinite(timestamp)) return date;
  const days = Math.ceil((timestamp - now) / (1000 * 60 * 60 * 24));
  if (days > 0) return `${date}  (in ${days} days)`;
  if (days === 0) return `${date}  (today)`;
  return `${date}  (${Math.abs(days)} days ago)`;
}
