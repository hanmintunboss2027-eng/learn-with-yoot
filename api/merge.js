/* generated from parts/c8i0-merge.js by build.py - do not edit */
/* ================= student data merge (shared by the app and the cloud API) =================
   A student's data is the set of per-student keys (progress, projects, subject stars, worlds, badges, done dates,
   maze, studio). Two copies (this device / the server, or two devices) merge without losing anything:
   stars keep the best, done flags stay done, sets union, studio creations union by id (newest wins), and
   "latest wins" for the few keys that are plain preferences. `ua` / `ub` are the last-change timestamps. */
function mergeStudentData(a, b, ua, ub) {
  a = a && typeof a === 'object' ? a : {}; b = b && typeof b === 'object' ? b : {};
  const newer = (ub || 0) > (ua || 0) ? b : a, older = newer === a ? b : a;
  const out = {};
  const keys = new Set(Object.keys(a).concat(Object.keys(b)));
  const maxArr = (x, y) => { const n = Math.max(x ? x.length : 0, y ? y.length : 0), r = []; for (let i = 0; i < n; i++) r[i] = Math.max(+(x && x[i]) || 0, +(y && y[i]) || 0); return r; };
  const mergeStars = (x, y) => { const r = {}; new Set(Object.keys(x || {}).concat(Object.keys(y || {}))).forEach(l => { r[l] = maxArr(x && x[l], y && y[l]); }); return r; };
  const mergeProj = (x, y) => { const r = {}; new Set(Object.keys(x || {}).concat(Object.keys(y || {}))).forEach(n => { const p = (x && x[n]) || {}, q = (y && y[n]) || {}; r[n] = { done: !!(p.done || q.done), ch: !!(p.ch || q.ch) }; const tr = [p.tries, q.tries].filter(v => v > 0); if (tr.length) r[n].tries = Math.min.apply(null, tr); }); return r; };
  keys.forEach(k => {
    const x = a[k], y = b[k];
    if (x == null) { out[k] = y; return; } if (y == null) { out[k] = x; return; }
    if (k === 'yoot.progress.v1') out[k] = mergeStars(x, y);
    else if (k === 'yoot.projects.v1') out[k] = mergeProj(x, y);
    else if (k.startsWith('yoot.s.')) out[k] = { L: mergeStars(x.L, y.L), P: mergeProj(x.P, y.P) };
    else if (k === 'yoot.badges.v1') out[k] = Array.from(new Set([].concat(Array.isArray(x) ? x : [], Array.isArray(y) ? y : [])));
    else if (k === 'yoot.done.v1') { const r = {}; new Set(Object.keys(x).concat(Object.keys(y))).forEach(s => { const d = [x[s], y[s]].filter(Boolean).sort(); r[s] = d[0]; }); out[k] = r; }
    else if (k === 'yoot.studio.v1') {
      const m = new Map();
      [].concat((x && x.list) || [], (y && y.list) || []).forEach(it => { if (!it || typeof it.id !== 'string') return; const cur = m.get(it.id); if (!cur || (it.updated || 0) > (cur.updated || 0)) m.set(it.id, it); });
      const del = new Set([].concat((x && x.deleted) || [], (y && y.deleted) || []));
      out[k] = { list: Array.from(m.values()).filter(it => !del.has(it.id)).sort((p, q) => (p.created || 0) - (q.created || 0)).slice(-40), deleted: Array.from(del).slice(-200) };
    }
    else if (k === 'yoot.game.v1') { const r = { best: {}, played: Math.max(+(x && x.played) || 0, +(y && y.played) || 0) }; new Set(Object.keys((x && x.best) || {}).concat(Object.keys((y && y.best) || {}))).forEach(s => { r.best[s] = Math.max(+((x && x.best || {})[s]) || 0, +((y && y.best || {})[s]) || 0); }); out[k] = r; }
    else out[k] = newer[k] != null ? newer[k] : older[k];
  });
  return out;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { mergeStudentData };
