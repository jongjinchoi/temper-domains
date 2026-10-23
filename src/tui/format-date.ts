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

// Whole days until the expiry (negative once it has passed), or undefined when unreadable.
export function expiryDays(value: string | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  // The day count treats such a value as UTC, as a bare date already is.
  const unzoned = UNZONED.exec(value);
  const timestamp = new Date(unzoned?.[2] ? `${unzoned[1]}T${unzoned[2]}Z` : value).getTime();
  return Number.isFinite(timestamp) ? Math.ceil((timestamp - now) / (1000 * 60 * 60 * 24)) : undefined;
}

export const EXPIRY_SOON_DAYS = 30;

// Within 30 days or already past: the registration may lapse soon (reference only).
export function isExpirySoon(value: string | undefined, now = Date.now()): boolean {
  const days = expiryDays(value, now);
  return days !== undefined && days <= EXPIRY_SOON_DAYS;
}

export function formatDetailExpiry(value: string | undefined, now = Date.now()): string | undefined {
  const date = formatDetailDate(value);
  if (!date || !value) return undefined;
  const days = expiryDays(value, now);
  if (days === undefined) return date;
  if (days > 0) return `${date}  (in ${days} days)`;
  if (days === 0) return `${date}  (today)`;
  return `${date}  (${Math.abs(days)} days ago)`;
}
