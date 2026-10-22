/**
 * Parse timestamps from API (UTC ISO or legacy strings without timezone).
 * Display helpers always use the user's local timezone.
 */

export function parseServerDate(value) {
  if (value == null || value === '') return new Date(NaN);
  if (value instanceof Date) return value;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s.replace(' ', 'T') + 'Z');
  }
  return new Date(s);
}

export function todayDateKey() {
  return localDateKey(new Date());
}

export function localDateKey(date = new Date()) {
  const d = date instanceof Date ? date : parseServerDate(date);
  if (Number.isNaN(d.getTime())) return todayDateKey();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localDateKeyFromTimestamp(value) {
  return localDateKey(parseServerDate(value));
}

export function normalizeDateKey(value) {
  if (!value) return '';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10))) {
    return raw.slice(0, 10);
  }
  const d = parseServerDate(value);
  if (Number.isNaN(d.getTime())) {
    return raw.slice(0, 10);
  }
  return localDateKey(d);
}

export function formatLocalTime(value) {
  const d = parseServerDate(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function formatLocalDate(value, options) {
  const d = parseServerDate(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', options);
}

export function sameLocalCalendarDay(a, b) {
  const da = parseServerDate(a);
  const db = parseServerDate(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.toDateString() === db.toDateString();
}
