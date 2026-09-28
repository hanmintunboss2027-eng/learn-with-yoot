'use strict';
/* ================= Learn with Yoot — cloud API (one Vercel function, Upstash Redis via REST) =================
   Roles: teacher (username + password; the first one, made by /setup, is the school admin) and student (created by a
   teacher: name + hero + 4-digit PIN). A teacher can register a school computer ("device") so children pick their
   name from the class list and type only their PIN. Parents get a read-only link code. Student data is one JSON
   blob per student, merged with mergeStudentData so no device ever loses stars. */
const crypto = require('crypto');
const { mergeStudentData } = require('./merge.js');
const KV_URL = process.env.KV_REST_API_URL, KV_TOKEN = process.env.KV_REST_API_TOKEN, ADMIN_KEY = process.env.YOOT_ADMIN_KEY || '';
const P = 'yoot:', SESS_TTL = 60 * 86400, DEV_TTL = 400 * 86400, MAX_BODY = 1.5e6, MAX_DATA = 900e3;

/* ---- redis (Upstash REST pipeline) ---- */
async function redis(cmds) {
  if (!KV_URL || !KV_TOKEN) { const e = new Error('cloud not configured'); e.status = 503; throw e; }
  const r = await fetch(KV_URL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  if (!r.ok) { const e = new Error('kv ' + r.status); e.status = 502; throw e; }
  const out = await r.json();
  return out.map(x => { if (x && x.error) throw new Error(x.error); return x ? x.result : null; });
}
const one = async (...cmd) => (await redis([cmd]))[0];
const jget = async k => { const v = await one('GET', P + k); if (v == null) return null; try { return JSON.parse(v); } catch (e) { return null; } };
const jset = (k, v, ttl) => (ttl ? one('SET', P + k, JSON.stringify(v), 'EX', String(ttl)) : one('SET', P + k, JSON.stringify(v)));
const del = k => one('DEL', P + k);
const sadd = (k, m) => one('SADD', P + k, m), srem = (k, m) => one('SREM', P + k, m), smembers = async k => (await one('SMEMBERS', P + k)) || [];

/* ---- helpers ---- */
const rnd = n => crypto.randomBytes(n).toString('hex');
const hash = (secret, salt) => crypto.pbkdf2Sync(String(secret), salt, 60000, 32, 'sha256').toString('hex');
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const slug = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '').slice(0, 32);
const cleanName = s => String(s || '').trim().replace(/[<>]/g, '').slice(0, 40);
const HEROES = ['yoot', 'sein', 'daung', 'zee', 'mimi', 'kyar'];
const err = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
const pubUser = u => ({ id: u.id, role: u.role, school: u.school, user: u.user, name: u.name, hero: u.hero, admin: !!u.admin, active: u.active !== false, created: u.created });
function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined && req.body !== null && typeof req.body === 'object') return resolve(req.body);
    let s = ''; req.on('data', c => { s += c; if (s.length > MAX_BODY) { reject(err(413, 'too large')); req.destroy(); } });
    req.on('end', () => { if (!s) return resolve({}); try { resolve(JSON.parse(s)); } catch (e) { reject(err(400, 'bad json')); } });
    req.on('error', reject);
  });
}
const userKey = (school, user) => 'user:' + school + ':' + user;
async function findUser(school, user) { return jget(userKey(school, user)); }
async function userById(id) { const ref = await one('GET', P + 'uid:' + id); return ref ? jget('user:' + ref) : null; }
async function saveUser(u) { await redis([['SET', P + userKey(u.school, u.user), JSON.stringify(u)], ['SET', P + 'uid:' + u.id, u.school + ':' + u.user]]); }
async function auth(req, roles) {
  const h = String(req.headers.authorization || ''), tok = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!/^[a-f0-9]{48}$/.test(tok)) throw err(401, 'login required');
  const s = await jget('sess:' + tok); if (!s) throw err(401, 'session expired');
  if (roles && !roles.includes(s.role)) throw err(403, 'not allowed');
  const u = await userById(s.uid); if (!u || u.active === false) throw err(401, 'account disabled');
  return { s, u, tok };
}
async function limited(key) { const n = await one('INCR', P + 'fail:' + key); if (n === 1) await one('EXPIRE', P + 'fail:' + key, '600'); return n > 8; }
async function newSession(u) { const tok = rnd(24); await jset('sess:' + tok, { uid: u.id, role: u.role, school: u.school, at: Date.now() }, SESS_TTL); return tok; }
const summaryOk = s => (s && typeof s === 'object' ? { stars: +s.stars || 0, max: +s.max || 0, ldone: +s.ldone || 0, lcount: +s.lcount || 0, pdone: +s.pdone || 0, pcount: +s.pcount || 0, ch: +s.ch || 0, creations: +s.creations || 0, subj: s.subj && typeof s.subj === 'object' ? s.subj : {} } : null);
async function studentRow(id) { const u = await userById(id); if (!u || u.role !== 'student') return null; const meta = await jget('meta:' + id); return Object.assign(pubUser(u), { summary: meta ? meta.summary : null, updated: meta ? meta.updated : 0, parent: meta && meta.parent ? meta.parent : null }); }
async function classList(school) { const ids = await smembers('students:' + school); const rows = await Promise.all(ids.map(studentRow)); return rows.filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name))); }
async function nextUser(school, base) { for (let n = 1; n < 10000; n++) { const u = base + n; if (!(await one('EXISTS', P + userKey(school, u)))) return u; } throw err(500, 'no username'); }

/* ---- routes ---- */
async function route(req, res, m, path, q) {
  const seg = path.split('/').filter(Boolean); // ['api', ...]
  const p1 = seg[1] || '', p2 = seg[2] || '';
  if (m === 'GET' && p1 === 'health') return { ok: true, configured: !!(KV_URL && KV_TOKEN), setup: !!ADMIN_KEY, v: 1 };

  if (m === 'POST' && p1 === 'setup') {
    const b = await readBody(req);
    if (!ADMIN_KEY || String(b.adminKey || '') !== ADMIN_KEY) throw err(403, 'wrong admin key');
    const code = slug(b.school && b.school.code), name = cleanName(b.school && b.school.name), t = b.teacher || {};
    const user = slug(t.user), pw = String(t.password || '');
    if (!code || code.length < 3) throw err(400, 'school code: 3+ letters/digits'); if (!name) throw err(400, 'school name'); if (!user || user.length < 3) throw err(400, 'teacher username: 3+ letters'); if (pw.length < 6) throw err(400, 'password: 6+ characters');
    if (await jget('school:' + code)) throw err(409, 'school exists');
    const salt = rnd(8), u = { id: 't' + rnd(6), role: 'teacher', school: code, user, name: cleanName(t.name) || user, hero: 'yoot', admin: true, salt, hash: hash(pw, salt), created: Date.now(), active: true };
    await jset('school:' + code, { code, name, created: Date.now(), admin: u.id });
    await saveUser(u); await sadd('teachers:' + code, u.id);
    const tok = await newSession(u);
    return { token: tok, me: pubUser(u), school: { code, name } };
  }

  if (m === 'POST' && p1 === 'login') {
    const b = await readBody(req);
    if (b.device) { /* a registered school computer: student id + PIN */
      const d = await jget('dev:' + String(b.device)); if (!d) throw err(401, 'device not registered');
      const u = await userById(String(b.sid || '')); if (!u || u.role !== 'student' || u.school !== d.school) throw err(404, 'student not found');
      if (u.active === false) throw err(401, 'account disabled');
      if (await limited(d.school + ':' + u.user)) throw err(429, 'too many tries — wait 10 minutes');
      if (!same(hash(String(b.pin || ''), u.salt), u.hash)) throw err(401, 'wrong PIN');
      await del('fail:' + d.school + ':' + u.user);
      const tok = await newSession(u), meta = await jget('meta:' + u.id);
      return { token: tok, me: pubUser(u), school: await jget('school:' + u.school), updated: meta ? meta.updated : 0 };
    }
    const school = slug(b.school), user = slug(b.user), secret = String(b.secret || '');
    if (!school || !user || !secret) throw err(400, 'school, user and PIN/password required');
    if (await limited(school + ':' + user)) throw err(429, 'too many tries — wait 10 minutes');
    const u = await findUser(school, user);
    if (!u || u.active === false || !same(hash(secret, u.salt), u.hash)) throw err(401, 'wrong school, name or PIN/password');
    await del('fail:' + school + ':' + user);
    const tok = await newSession(u), meta = u.role === 'student' ? await jget('meta:' + u.id) : null;
    return { token: tok, me: pubUser(u), school: await jget('school:' + school), updated: meta ? meta.updated : 0 };
  }

  if (m === 'GET' && p1 === 'parent' && p2) { /* public, read-only */
    const code = slug(p2); const sid = await one('GET', P + 'parent:' + code); if (!sid) throw err(404, 'link not found');
    const u = await userById(sid); if (!u) throw err(404, 'student not found');
    const [data, meta, school] = await Promise.all([jget('data:' + u.id), jget('meta:' + u.id), jget('school:' + u.school)]);
    return { me: { name: u.name, hero: u.hero }, school: school ? { code: school.code, name: school.name } : null, data: data || {}, summary: meta ? meta.summary : null, updated: meta ? meta.updated : 0 };
  }

  /* everything below needs a session */
  if (m === 'POST' && p1 === 'logout') { const { tok } = await auth(req); await del('sess:' + tok); return { ok: true }; }
  if (m === 'GET' && p1 === 'me') {
    const { u } = await auth(req);
    const school = await jget('school:' + u.school);
    if (u.role === 'student') { const [data, meta] = await Promise.all([jget('data:' + u.id), jget('meta:' + u.id)]); return { me: pubUser(u), school, data: data || {}, updated: meta ? meta.updated : 0, parent: meta && meta.parent ? meta.parent : null }; }
    return { me: pubUser(u), school };
  }
  if (m === 'PUT' && p1 === 'data') { /* student (own) or teacher (?sid=) pushes a copy; the server merges and answers with the result */
    const { u } = await auth(req);
    let sid = u.id;
    if (u.role === 'teacher') { sid = String(q.sid || ''); const t = await userById(sid); if (!t || t.role !== 'student' || t.school !== u.school) throw err(404, 'student not found'); }
    const b = await readBody(req);
    if (!b.data || typeof b.data !== 'object') throw err(400, 'data required');
    if (JSON.stringify(b.data).length > MAX_DATA) throw err(413, 'data too large');
    const [cur, meta] = await Promise.all([jget('data:' + sid), jget('meta:' + sid)]);
    const merged = mergeStudentData(cur || {}, b.data, meta ? meta.updated : 0, +b.updated || Date.now());
    const now = Date.now(), summary = summaryOk(b.summary) || (meta ? meta.summary : null);
    await redis([['SET', P + 'data:' + sid, JSON.stringify(merged)], ['SET', P + 'meta:' + sid, JSON.stringify(Object.assign({}, meta || {}, { summary, updated: now }))]]);
    return { data: merged, updated: now };
  }
  if (m === 'GET' && p1 === 'class') { /* device token or teacher session: the class list for the who-screen / dashboard */
    const dev = String(q.device || '');
    let school;
    if (dev) { const d = await jget('dev:' + dev); if (!d) throw err(401, 'device not registered'); school = d.school; }
    else { const { u } = await auth(req, ['teacher']); school = u.school; }
    const rows = await classList(school);
    return { school: await jget('school:' + school), students: dev ? rows.map(r => ({ id: r.id, name: r.name, hero: r.hero, user: r.user, active: r.active, summary: r.summary ? { stars: r.summary.stars } : null })) : rows };
  }
  if (p1 === 'students') {
    const { u } = await auth(req, ['teacher']);
    if (m === 'POST') {
      const b = await readBody(req), name = cleanName(b.name), pin = String(b.pin || '');
      if (!name) throw err(400, 'name required'); if (!/^\d{4}$/.test(pin)) throw err(400, 'PIN: 4 digits');
      const user = slug(b.user) || await nextUser(u.school, 'kid');
      if (await findUser(u.school, user)) throw err(409, 'username taken');
      const salt = rnd(8), s = { id: 's' + rnd(6), role: 'student', school: u.school, user, name, hero: HEROES.includes(b.hero) ? b.hero : 'yoot', salt, hash: hash(pin, salt), created: Date.now(), createdBy: u.id, active: true };
      await saveUser(s); await sadd('students:' + u.school, s.id);
      return { student: await studentRow(s.id) };
    }
    if (!p2) throw err(404, 'student id');
    const s = await userById(p2); if (!s || s.role !== 'student' || s.school !== u.school) throw err(404, 'student not found');
    if (m === 'GET') { const [data, meta] = await Promise.all([jget('data:' + s.id), jget('meta:' + s.id)]); return { student: await studentRow(s.id), data: data || {}, updated: meta ? meta.updated : 0 }; }
    if (m === 'PATCH') {
      const b = await readBody(req);
      if (b.name !== undefined) { const n = cleanName(b.name); if (n) s.name = n; }
      if (b.hero !== undefined && HEROES.includes(b.hero)) s.hero = b.hero;
      if (b.pin !== undefined) { if (!/^\d{4}$/.test(String(b.pin))) throw err(400, 'PIN: 4 digits'); s.salt = rnd(8); s.hash = hash(String(b.pin), s.salt); await del('fail:' + s.school + ':' + s.user); }
      if (b.active !== undefined) s.active = !!b.active;
      await saveUser(s);
      return { student: await studentRow(s.id) };
    }
    if (m === 'DELETE') {
      const meta = await jget('meta:' + s.id);
      const cmds = [['DEL', P + userKey(s.school, s.user)], ['DEL', P + 'uid:' + s.id], ['DEL', P + 'data:' + s.id], ['DEL', P + 'meta:' + s.id], ['SREM', P + 'students:' + s.school, s.id]];
      if (meta && meta.parent) cmds.push(['DEL', P + 'parent:' + meta.parent]);
      await redis(cmds);
      return { ok: true };
    }
  }
  if (p1 === 'parentlink') { /* teacher makes (or rotates) the read-only link code of a student */
    const { u } = await auth(req, ['teacher']);
    const b = await readBody(req), s = await userById(String(b.sid || '')); if (!s || s.role !== 'student' || s.school !== u.school) throw err(404, 'student not found');
    const meta = (await jget('meta:' + s.id)) || {};
    if (meta.parent && !b.rotate) return { code: meta.parent };
    const code = rnd(5);
    const cmds = [['SET', P + 'parent:' + code, s.id], ['SET', P + 'meta:' + s.id, JSON.stringify(Object.assign(meta, { parent: code }))]];
    if (meta.parent) cmds.unshift(['DEL', P + 'parent:' + meta.parent]);
    await redis(cmds);
    return { code };
  }
  if (p1 === 'device') { /* a teacher registers this computer for the class list */
    const { u } = await auth(req, ['teacher']);
    if (m === 'POST') { const b = await readBody(req), tok = rnd(24); await jset('dev:' + tok, { school: u.school, by: u.id, name: cleanName(b.name) || 'computer', at: Date.now() }, DEV_TTL); return { device: tok, school: await jget('school:' + u.school) }; }
    if (m === 'DELETE') { const b = await readBody(req); await del('dev:' + String(b.device || '')); return { ok: true }; }
  }
  if (p1 === 'teachers') {
    const { u } = await auth(req, ['teacher']);
    if (m === 'GET') { const ids = await smembers('teachers:' + u.school); const rows = await Promise.all(ids.map(userById)); return { teachers: rows.filter(Boolean).map(pubUser) }; }
    if (m === 'POST') {
      if (!u.admin) throw err(403, 'admin only');
      const b = await readBody(req), user = slug(b.user), pw = String(b.password || '');
      if (!user || user.length < 3) throw err(400, 'username: 3+ letters'); if (pw.length < 6) throw err(400, 'password: 6+ characters');
      if (await findUser(u.school, user)) throw err(409, 'username taken');
      const salt = rnd(8), t = { id: 't' + rnd(6), role: 'teacher', school: u.school, user, name: cleanName(b.name) || user, hero: 'yoot', admin: false, salt, hash: hash(pw, salt), created: Date.now(), active: true };
      await saveUser(t); await sadd('teachers:' + u.school, t.id);
      return { teacher: pubUser(t) };
    }
    if (m === 'PATCH' && p2) {
      const b = await readBody(req), t = await userById(p2); if (!t || t.role !== 'teacher' || t.school !== u.school) throw err(404, 'teacher not found');
      if (t.id !== u.id && !u.admin) throw err(403, 'admin only');
      if (b.password !== undefined) { const pw = String(b.password); if (pw.length < 6) throw err(400, 'password: 6+ characters'); t.salt = rnd(8); t.hash = hash(pw, t.salt); }
      if (b.name !== undefined) { const n = cleanName(b.name); if (n) t.name = n; }
      if (b.active !== undefined && u.admin && t.id !== u.id) t.active = !!b.active;
      await saveUser(t);
      return { teacher: pubUser(t) };
    }
  }
  throw err(404, 'no such route');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const url = new URL(req.url, 'http://x'), q = Object.fromEntries(url.searchParams.entries());
  try {
    const out = await route(req, res, req.method, url.pathname, q);
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out));
  } catch (e) {
    const status = e.status || 500;
    res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: status === 500 ? 'server error' : e.message }));
    if (status === 500) console.error(e);
  }
};
