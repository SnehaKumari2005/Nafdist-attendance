const express = require('express');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const path = require('path');
const { sanitizeStaff, sanitizeDay, isDate } = require('./lib');

const PORT = process.env.PORT || 3000;
const URI = process.env.MONGODB_URI;
const PASSWORD = process.env.APP_PASSWORD || '';
if (!URI) { console.error('MONGODB_URI is not set. See README.'); process.exit(1); }

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb' }));

// --- password check (one shared password, sent by the page in a header) ---
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const fails = new Map(); // ip -> {n, t}
app.use('/api', (req, res, next) => {
  if (!PASSWORD) return next();
  const f = fails.get(req.ip);
  if (f && Date.now() - f.t < 10 * 60 * 1000 && f.n >= 20) return res.status(429).json({ error: 'too_many_attempts' });
  const ok = crypto.timingSafeEqual(sha(req.get('x-app-password') || ''), sha(PASSWORD));
  if (ok) { fails.delete(req.ip); return next(); }
  fails.set(req.ip, { n: (f && Date.now() - f.t < 10 * 60 * 1000 ? f.n : 0) + 1, t: Date.now() });
  res.status(401).json({ error: 'unauthorized' });
});

let days, config;

app.get('/api/data', async (req, res) => {
  try {
    const s = await config.findOne({ _id: 'staff' });
    const list = await days.find({}).toArray();
    res.json({
      staff: (s && s.names) || [],
      days: list.map(({ _id, updatedAt, ...rest }) => ({ date: _id, ...rest })),
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server_error' }); }
});

app.put('/api/staff', async (req, res) => {
  const names = sanitizeStaff(req.body && req.body.names);
  if (!names) return res.status(400).json({ error: 'bad_request' });
  try {
    await config.replaceOne({ _id: 'staff' }, { _id: 'staff', names, updatedAt: new Date() }, { upsert: true });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server_error' }); }
});

app.put('/api/days/:date', async (req, res) => {
  const date = req.params.date;
  const doc = sanitizeDay(req.body);
  if (!isDate(date) || !doc) return res.status(400).json({ error: 'bad_request' });
  try {
    await days.replaceOne({ _id: date }, { _id: date, ...doc, updatedAt: new Date() }, { upsert: true });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server_error' }); }
});

app.use(express.static(path.join(__dirname, 'public')));

async function seed() {
  // First run only: put in the staff list and the 20/11/2026 entry.
  if (!(await config.findOne({ _id: 'staff' }))) {
    await config.insertOne({ _id: 'staff', names: ['Sumi', 'Rupa', 'Chhoti', 'Sita Mardi', 'Sombari'], updatedAt: new Date() });
  }
  if ((await days.countDocuments({})) === 0) {
    const P = (name, from) => ({ name, status: 'P', from, to: '17:00', brk: 0 });
    await days.insertOne({
      _id: '2026-11-20', ot: 6, note: '', updatedAt: new Date(),
      rows: [P('Sumi', '06:00'), P('Rupa', '08:00'), { name: 'Chhoti', status: 'A', from: '', to: '', brk: 0 }, P('Sita Mardi', '06:00'), P('Sombari', '06:00')],
      work: [{ process: 'Mixing', detail: 'Material production to Telco', size: '3.5mm', qty: 140, unit: 'kg' }],
    });
  }
}

MongoClient.connect(URI).then(async (client) => {
  const db = client.db(process.env.DB_NAME || 'nafdist');
  days = db.collection('days');
  config = db.collection('config');
  await seed();
  app.listen(PORT, () => console.log('Nafdist tracker running on port ' + PORT));
}).catch((e) => { console.error('Could not connect to MongoDB:', e.message); process.exit(1); });
