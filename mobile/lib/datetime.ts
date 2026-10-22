export function parseServerDate(value: string | Date | null | undefined): Date {
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

export function localDateKey(date: Date = new Date()): string {
  const d = date instanceof Date ? date : parseServerDate(date);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return localDateKey(now);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localDateKeyFromTimestamp(value: string): string {
  return localDateKey(parseServerDate(value));
}

export function formatLocalTime(value: string): string {
  const d = parseServerDate(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function formatLocalDate(value: string): string {
  const d = parseServerDate(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU');
}

export function formatLocalDateTime(value: string): string {
  const d = parseServerDate(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function last15LocalDateKeys(): string[] {
  const out: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 14; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(localDateKey(d));
  }
  return out;
}
