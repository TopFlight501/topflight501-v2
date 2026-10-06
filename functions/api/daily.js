// Daily Match leaderboard: anonymous daily totals in Cloudflare KV (binding: SCORES).
// Stores only score + country per day. No names, IPs or device IDs.
const START = Date.UTC(2026, 9, 2);           // Daily #1 = 2 October 2026
const MAX = 360;                              // six darts x 60
const dayNow = () => Math.floor((Date.now() - START) / 864e5) + 1;
const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
const blank = n => ({ n, c: 0, h: {}, cc: {} });

async function load(env, n) { return (await env.SCORES.get('d:' + n, 'json')) || blank(n); }
async function summary(env, d) {
  const best = await env.SCORES.get('best', 'json');
  const countries = Object.entries(d.cc).map(([cc, v]) => ({ cc, p: v.top, c: v.c })).sort((a, b) => b.p - a.p || b.c - a.c);
  const top = countries[0] ? { p: countries[0].p, cc: countries[0].cc } : null;
  return { n: d.n, count: d.c, top, countries: countries.slice(0, 3), hist: d.h, best };
}

export async function onRequestGet({ request, env }) {
  if (!env.SCORES) return json({ off: true }, 503);
  const q = Number(new URL(request.url).searchParams.get('n')) || dayNow();
  return json(await summary(env, await load(env, q)));
}

export async function onRequestPost({ request, env }) {
  if (!env.SCORES) return json({ off: true }, 503);
  let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const n = Number(body.n), p = Number(body.p), now = dayNow();
  if (!Number.isInteger(n) || n < now - 1 || n > now + 1) return json({ error: 'wrong day' }, 400);
  if (!Number.isInteger(p) || p < 0 || p > MAX || p % 5) return json({ error: 'bad score' }, 400);
  let cc = (request.cf && request.cf.country) || request.headers.get('cf-ipcountry') || 'XX';
  if (!/^[A-Z]{2}$/.test(cc) || cc === 'XX' || cc === 'T1') cc = 'XX';
  const d = await load(env, n);
  d.c += 1; d.h[p] = (d.h[p] || 0) + 1;
  const k = d.cc[cc] || { top: 0, c: 0 }; k.c += 1; k.top = Math.max(k.top, p); d.cc[cc] = k;
  await env.SCORES.put('d:' + n, JSON.stringify(d));
  const best = await env.SCORES.get('best', 'json');
  if (!best || p > best.p) await env.SCORES.put('best', JSON.stringify({ p, cc, n }));
  return json(await summary(env, d));
}
