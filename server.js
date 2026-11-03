'use strict';
// Diwali Lantern Wall: zero-dependency Node server (Node 16+). No sign-in for employees.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const INDEX = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

// ---------------------------------------------------------------------------
// Storage. With UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN set, every lantern, selfie, setting
// and the logo are saved to a free Upstash Redis database, so nothing is lost when the server restarts.
// Without them, data is kept in a local file (fine on your own computer, but erased on free hosting).
// ---------------------------------------------------------------------------
const REDIS_URL = String(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').trim().replace(/\/+$/, '');
const REDIS_TOKEN = String(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim();
const USE_REDIS = !!(REDIS_URL && REDIS_TOKEN);
const STORAGE = USE_REDIS ? 'redis' : 'file';
const K_DIYAS = 'diwali:diyas', K_CONFIG = 'diwali:config', K_LOGO = 'diwali:logo', K_ADMIN = 'diwali:adminKey';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function redis(cmd) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(10000)
  });
  let j = {}; try { j = await r.json(); } catch (e) { /* ignore */ }
  if (!r.ok || j.error) throw new Error(j.error || ('storage HTTP ' + r.status));
  return j.result;
}

let db = { diyas: {}, config: { company: '', goal: 100, qrUrl: '' }, adminKey: '' };
let redisReady = !USE_REDIS;

// Writes are queued and retried so a short network hiccup never loses a lantern.
const queue = [];
let pumping = false;
function enqueue(fn) { queue.push({ fn, tries: 0 }); pump(); }
async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length) {
    const job = queue[0];
    try { await job.fn(); queue.shift(); }
    catch (e) {
      job.tries++; console.error('Storage write failed (try ' + job.tries + '):', e.message);
      if (job.tries >= 8) { queue.shift(); console.error('Giving up on one write.'); } else await sleep(Math.min(8000, 700 * job.tries));
    }
  }
  pumping = false;
}

// file mode
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DATA_FILE + '.tmp';
    try { fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DATA_FILE); } catch (e) { console.error('Could not save data:', e.message); }
  }, 300);
}
function persistDiya(id) { if (USE_REDIS) { const v = JSON.stringify(db.diyas[id]); enqueue(() => redis(['HSET', K_DIYAS, id, v])); } else save(); }
function persistRemove(id) { if (USE_REDIS) enqueue(() => redis(['HDEL', K_DIYAS, id])); else save(); }
function persistConfig() { if (USE_REDIS) { const v = JSON.stringify(db.config); enqueue(() => redis(['SET', K_CONFIG, v])); } else save(); }
function persistLogo() {
  if (!USE_REDIS) return save();
  if (db.logo) { const v = JSON.stringify({ mime: db.logo.mime, b64: db.logo.b64, v: db.logoV }); enqueue(() => redis(['SET', K_LOGO, v])); }
  else enqueue(() => redis(['DEL', K_LOGO]));
}
function persistClear(withLogo) {
  if (!USE_REDIS) return save();
  enqueue(() => redis(['DEL', K_DIYAS]));
  if (withLogo) enqueue(() => redis(['DEL', K_LOGO]));
}

async function loadRedis() {
  const flat = await redis(['HGETALL', K_DIYAS]);
  const pairs = Array.isArray(flat) ? flat : Object.entries(flat || {}).flat();
  let added = 0;
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    if (db.diyas[pairs[i]]) continue;
    try { db.diyas[pairs[i]] = JSON.parse(pairs[i + 1]); added++; } catch (e) { /* skip a damaged record */ }
  }
  try { const c = await redis(['GET', K_CONFIG]); if (c) db.config = Object.assign(db.config, JSON.parse(c)); } catch (e) { if (!/JSON/.test(e.name)) throw e; }
  try { const l = await redis(['GET', K_LOGO]); if (l) { const o = JSON.parse(l); db.logo = { mime: o.mime, b64: o.b64 }; db.logoV = o.v || 1; } } catch (e) { if (!/JSON/.test(e.name)) throw e; }
  if (!process.env.ADMIN_KEY) { const k = await redis(['GET', K_ADMIN]); if (k) db.adminKey = k; }
  return added;
}

async function boot() {
  if (!USE_REDIS) {
    try { db = Object.assign(db, JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); } catch (e) { /* first run */ }
  } else {
    for (let attempt = 1; attempt <= 3 && !redisReady; attempt++) {
      try { const n = await loadRedis(); redisReady = true; console.log('Loaded ' + Object.keys(db.diyas).length + ' lanterns from permanent storage.'); }
      catch (e) { console.error('Could not reach storage (attempt ' + attempt + '):', e.message); if (attempt < 3) await sleep(1500 * attempt); }
    }
    if (!redisReady) {
      console.error('Starting without stored data; will keep retrying in the background.');
      (async function retry() {
        while (!redisReady) { await sleep(15000); try { await loadRedis(); redisReady = true; console.log('Storage connected; data restored.'); broadcast(null, state()); } catch (e) { console.error('Storage still unreachable:', e.message); } }
      })();
    }
  }
  if (process.env.ADMIN_KEY) db.adminKey = process.env.ADMIN_KEY;
  if (!db.adminKey) {
    db.adminKey = crypto.randomBytes(4).toString('hex');
    if (USE_REDIS) { const k = db.adminKey; enqueue(() => redis(['SET', K_ADMIN, k])); } else save();
  }
}

const CHARS = ['lehenga', 'saree', 'anarkali', 'kurta', 'sherwani', 'dhoti'];
const clean = (v, max) => String(v || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const pub = (cid) => crypto.createHash('sha256').update('diya:' + cid).digest('hex').slice(0, 16);
const validCid = (c) => typeof c === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(c);
function isAdmin(req) {
  const k = String(req.headers['x-admin-key'] || '');
  const a = Buffer.from(k), b = Buffer.from(db.adminKey);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function state() {
  const diyas = Object.entries(db.diyas).map(([id, d]) => ({ id, name: d.name, character: d.character || (d.gender === 'female' ? 'lehenga' : 'kurta'), team: d.team, wish: d.wish, at: d.at, pv: d.photo ? (d.pv || 1) : 0 }));
  diyas.sort((x, y) => x.at - y.at);
  return { diyas, config: Object.assign({}, db.config, { logoV: db.logo ? (db.logoV || 1) : 0 }) };
}

const clients = new Set();
function broadcast(event, payload) {
  const msg = (event ? 'event: ' + event + '\n' : '') + 'data: ' + JSON.stringify(payload) + '\n\n';
  for (const res of clients) { try { res.write(msg); } catch (e) { clients.delete(res); } }
}
setInterval(() => { for (const res of clients) { try { res.write(': ping\n\n'); } catch (e) { clients.delete(res); } } }, 25000);

const hits = new Map();
function limited(ip) {
  const now = Date.now(), h = hits.get(ip) || { n: 0, t: now + 60000 };
  if (now > h.t) { h.n = 0; h.t = now + 60000; }
  h.n++; hits.set(ip, h);
  return h.n > 300; // an office shares one public address, so allow a lobby rush
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0, tooBig = false; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max * 20) { req.destroy(); return; }          // absurdly large: drop the connection
      if (size > (max || 4096)) { tooBig = true; chunks.length = 0; return; } // discard the rest
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return reject(new Error('too large'));
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress;
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(INDEX);
    }
    if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { ok: true, storage: STORAGE, ready: redisReady, pending: queue.length, lanterns: Object.keys(db.diyas).length });
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const cid = url.searchParams.get('cid');
      return json(res, 200, Object.assign(state(), { myId: validCid(cid) ? pub(cid) : null }));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/photo/')) {
      const d = db.diyas[url.pathname.split('/').pop()];
      if (!d || !d.photo) return json(res, 404, { error: 'Not found' });
      const buf = Buffer.from(d.photo, 'base64');
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Length': buf.length });
      return res.end(buf);
    }
    if (req.method === 'GET' && url.pathname === '/api/logo') {
      if (!db.logo) return json(res, 404, { error: 'Not found' });
      const buf = Buffer.from(db.logo.b64, 'base64');
      res.writeHead(200, { 'Content-Type': db.logo.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Length': buf.length });
      return res.end(buf);
    }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n\n');
      res.write('data: ' + JSON.stringify(state()) + '\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/light') {
      if (limited(ip)) return json(res, 429, { error: 'Too many requests. Please wait a minute.' });
      const b = await readBody(req, 100000);
      if (!validCid(b.cid)) return json(res, 400, { error: 'Bad request.' });
      const name = clean(b.name, 28);
      if (!name) return json(res, 400, { error: 'Please add your name.' });
      let ch = b.character;
      if (!CHARS.includes(ch)) {
        if (b.gender === 'female') ch = 'lehenga'; else if (b.gender === 'male') ch = 'kurta';
        else return json(res, 400, { error: 'Please choose a character.' });
      }
      const id = pub(b.cid);
      if (!db.diyas[id] && Object.keys(db.diyas).length >= 5000) return json(res, 507, { error: 'The wall is full.' });
      const prev = db.diyas[id];
      let photo = prev ? prev.photo : undefined, pv = prev ? prev.pv : 0;
      if (b.removePhoto === true) { photo = undefined; pv = 0; }
      if (typeof b.photo === 'string' && b.photo) {
        const m = /^data:image\/jpeg;base64,([A-Za-z0-9+\/=]+)$/.exec(b.photo);
        const buf = m ? Buffer.from(m[1], 'base64') : null;
        if (!buf || buf.length < 500 || buf.length > 70000 || buf[0] !== 0xFF || buf[1] !== 0xD8 || buf[2] !== 0xFF) {
          return json(res, 400, { error: 'That photo could not be used.' });
        }
        photo = m[1]; pv = Date.now();
      }
      db.diyas[id] = Object.assign({ name, character: ch, team: clean(b.team, 30), wish: clean(b.wish, 90), at: prev ? prev.at : Date.now() }, photo ? { photo, pv } : {});
      persistDiya(id); broadcast(null, state());
      return json(res, 200, { ok: true, id });
    }
    if (url.pathname.startsWith('/api/admin') || (req.method === 'DELETE' && url.pathname.startsWith('/api/diya/'))) {
      if (!isAdmin(req)) return json(res, 401, { error: 'Wrong organizer key.' });
      if (req.method === 'POST' && url.pathname === '/api/admin/check') return json(res, 200, { ok: true, storage: STORAGE, ready: redisReady, pending: queue.length, lanterns: Object.keys(db.diyas).length });
      if (req.method === 'POST' && url.pathname === '/api/admin/config') {
        const b = await readBody(req);
        const c = Object.assign({}, db.config);
        if (b.company !== undefined) c.company = clean(b.company, 40);
        if (b.goal !== undefined) c.goal = Math.max(1, Math.min(5000, parseInt(b.goal, 10) || 100));
        if (b.qrUrl !== undefined) c.qrUrl = clean(b.qrUrl, 400);
        db.config = c;
        persistConfig(); broadcast(null, state()); return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/logo') {
        const b = await readBody(req, 400000);
        if (b.data === null) { delete db.logo; db.logoV = 0; }
        else {
          const m = typeof b.data === 'string' ? /^data:image\/(png|jpeg);base64,([A-Za-z0-9+\/=]+)$/.exec(b.data) : null;
          const buf = m ? Buffer.from(m[2], 'base64') : null;
          const okPng = buf && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
          const okJpg = buf && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
          if (!buf || buf.length < 100 || buf.length > 250000 || !(m[1] === 'png' ? okPng : okJpg)) return json(res, 400, { error: 'That logo could not be used.' });
          db.logo = { mime: 'image/' + m[1], b64: m[2] }; db.logoV = Date.now();
        }
        persistLogo(); broadcast(null, state()); return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/clear') {
        const b = await readBody(req);
        db.diyas = {};
        if (b.logo === true) { delete db.logo; db.logoV = 0; }
        persistClear(b.logo === true); broadcast(null, state()); return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/celebrate') { broadcast('celebrate', {}); return json(res, 200, { ok: true }); }
      if (req.method === 'DELETE' && url.pathname.startsWith('/api/diya/')) {
        const rid = url.pathname.split('/').pop();
        delete db.diyas[rid];
        persistRemove(rid); broadcast(null, state()); return json(res, 200, { ok: true });
      }
    }
    json(res, 404, { error: 'Not found' });
  } catch (e) {
    if (e && e.message === 'too large') json(res, 413, { error: 'That upload is too large.' });
    else json(res, 400, { error: 'Bad request.' });
  }
});

boot().then(() => {
  server.listen(PORT, () => {
    console.log('Diwali Lantern Wall running on http://localhost:' + PORT);
    console.log('Lobby wall:    http://localhost:' + PORT + '/#wall');
    console.log('Storage:       ' + (USE_REDIS ? 'permanent (Upstash Redis)' : 'local file (temporary on free hosting)'));
    console.log('Organizer key: ' + db.adminKey + '  (set ADMIN_KEY to choose your own)');
  });
});
