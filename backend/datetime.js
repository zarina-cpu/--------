/** Local calendar date YYYY-MM-DD (device / server local timezone). */
function localDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** UTC ISO string for storage and API (clients render in local time). */
function toIsoUtc(value) {
  if (value == null || value === '') return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString();
}

function nowIsoUtc() {
  return new Date().toISOString();
}

module.exports = {
  localDateKey,
  toIsoUtc,
  nowIsoUtc,
};
