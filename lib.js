// Input checking, kept separate so it has no dependencies.
const str = (v, max) => String(v == null ? '' : v).slice(0, max);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z'));
const isTime = (s) => s === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

function sanitizeStaff(names) {
  if (!Array.isArray(names)) return null;
  const out = [];
  for (const n of names.slice(0, 200)) {
    const t = str(n, 60).trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function sanitizeDay(d) {
  if (!d || typeof d !== 'object') return null;
  const rows = (Array.isArray(d.rows) ? d.rows : []).slice(0, 200).map((r) => ({
    name: str(r && r.name, 60).trim(),
    status: r && r.status === 'P' ? 'P' : 'A',
    from: isTime(str(r && r.from, 5)) ? str(r && r.from, 5) : '',
    to: isTime(str(r && r.to, 5)) ? str(r && r.to, 5) : '',
    brk: Math.min(24, Math.max(0, num(r && r.brk))),
  })).filter((r) => r.name);
  const work = (Array.isArray(d.work) ? d.work : []).slice(0, 100).map((w) => ({
    process: str(w && w.process, 80),
    detail: str(w && w.detail, 200),
    size: str(w && w.size, 40),
    qty: w && w.qty !== '' && w.qty != null && Number.isFinite(Number(w.qty)) ? Number(w.qty) : '',
    unit: str(w && w.unit, 20),
  }));
  return { rows, ot: Math.max(0, num(d.ot)), work, note: str(d.note, 2000) };
}

module.exports = { sanitizeStaff, sanitizeDay, isDate };
