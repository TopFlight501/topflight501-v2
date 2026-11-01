// Daily Match leaderboard: anonymous daily totals. Stores only score + country per day. No names, IPs or device IDs.
//
// Kept in the D1 database (binding: DB) as running counts: one row per day, score and country.
// D1 takes many writes at once without losing any, which the old single KV record couldn't
// (KV allowed one write a second to it and 1,000 writes a day on the free plan).
// Dailies up to SWITCH_N were counted in KV (binding: SCORES); those counts are still read and added in.
import { db } from '../../lib/server.js';

const START = Date.UTC(2026, 9, 2);           // Daily #1 = 2 October 2026
const SWITCH_N = 31;                          // Daily #31 (1 November 2026): the day scores moved to D1
const MAX = 360;                              // six darts x 60
const dayNow = () => Math.floor((Date.now() - START) / 864e5) + 1;
const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

// Old KV counts for a day before the switch: { c, h: {score: count}, cc: {country: {top, c}} }
async function oldDay(env, n) {
  if (n > SWITCH_N || !env.SCORES) return null;
  try { return await env.SCORES.get('d:' + n, 'json'); } catch { return null; }
}

// The all-time best, seeded once from the old KV record
async function getBest(env, DB) {
  let best = await DB.prepare('SELECT p, cc, n FROM dbest WHERE id = 1').first();
  if (!best && env.SCORES) {
    let old = null; try { old = await env.SCORES.get('best', 'json'); } catch { /* ignore */ }
    if (old && Number.isInteger(old.p)) {
      await DB.prepare('INSERT OR IGNORE INTO dbest (id, p, cc, n) VALUES (1, ?, ?, ?)').bind(old.p, old.cc || 'XX', old.n || 0).run();
      best = { p: old.p, cc: old.cc || 'XX', n: old.n || 0 };
    }
  }
  return best ? { p: best.p, cc: best.cc, n: best.n } : null;
}

async function summary(env, DB, n) {
  const rows = (await DB.prepare('SELECT p, cc, c FROM dagg WHERE n = ?').bind(n).all()).results || [];
  const d = { c: 0, h: {}, cc: {} };
  const add = (p, cc, c) => {
    d.c += c; d.h[p] = (d.h[p] || 0) + c;
    const k = d.cc[cc] || { top: 0, c: 0 }; k.c += c; k.top = Math.max(k.top, p); d.cc[cc] = k;
  };
  for (const r of rows) add(r.p, r.cc, r.c);
  const old = await oldDay(env, n);
  if (old) {
    d.c += old.c || 0;
    for (const [p, c] of Object.entries(old.h || {})) d.h[p] = (d.h[p] || 0) + c;
    for (const [cc, v] of Object.entries(old.cc || {})) {
      const k = d.cc[cc] || { top: 0, c: 0 }; k.c += v.c || 0; k.top = Math.max(k.top, v.top || 0); d.cc[cc] = k;
    }
  }
  const countries = Object.entries(d.cc).map(([cc, v]) => ({ cc, p: v.top, c: v.c })).sort((a, b) => b.p - a.p || b.c - a.c);
  const top = countries[0] ? { p: countries[0].p, cc: countries[0].cc } : null;
  return { n, count: d.c, top, countries: countries.slice(0, 3), hist: d.h, best: await getBest(env, DB) };
}

async function database(env) {
  try { return await db(env); } catch { return null; }
}

export async function onRequestGet({ request, env }) {
  try {
    const DB = await database(env);
    if (!DB) return json({ off: true }, 503);
    const q = Number(new URL(request.url).searchParams.get('n')) || dayNow();
    return json(await summary(env, DB, q));
  } catch (e) {
    console.error(e);
    return json({ error: 'busy' }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const DB = await database(env);
    if (!DB) return json({ off: true }, 503);
    let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
    const n = Number(body.n), p = Number(body.p), now = dayNow();
    if (!Number.isInteger(n) || n < now - 1 || n > now + 1) return json({ error: 'wrong day' }, 400);
    if (!Number.isInteger(p) || p < 0 || p > MAX || p % 5) return json({ error: 'bad score' }, 400);
    let cc = (request.cf && request.cf.country) || request.headers.get('cf-ipcountry') || 'XX';
    if (!/^[A-Z]{2}$/.test(cc) || cc === 'XX' || cc === 'T1') cc = 'XX';
    await getBest(env, DB);   // make sure the old all-time best is carried over before it can be beaten
    await DB.batch([
      DB.prepare('INSERT INTO dagg (n, p, cc, c) VALUES (?, ?, ?, 1) ON CONFLICT (n, p, cc) DO UPDATE SET c = c + 1').bind(n, p, cc),
      DB.prepare('INSERT INTO dbest (id, p, cc, n) VALUES (1, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET p = excluded.p, cc = excluded.cc, n = excluded.n WHERE excluded.p > dbest.p').bind(p, cc, n),
    ]);
    return json(await summary(env, DB, n));
  } catch (e) {
    console.error(e);
    return json({ error: 'busy' }, 503);
  }
}
