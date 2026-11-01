// Tests for the anonymous Daily Match leaderboard (functions/api/daily.js) on an in-memory database.
//   node tools/test_daily.mjs
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet, onRequestPost } from '../functions/api/daily.js';

const sqlite = new DatabaseSync(':memory:');
class Stmt {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...a) { return new Stmt(this.sql, a); }
  exec() { const r = sqlite.prepare(this.sql).run(...this.args); return { meta: { changes: r.changes } }; }
  async first() { return sqlite.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  async run() { return this.exec(); }
}
const DB = {
  prepare: sql => new Stmt(sql),
  async batch(list) {   // all in one go, like D1
    sqlite.exec('BEGIN');
    try { const out = list.map(s => s.exec()); sqlite.exec('COMMIT'); return out; }
    catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  },
};
// old KV data from before the switch: 4 players on today's Daily, an all-time best of 300
const kv = new Map([
  ['d:31', JSON.stringify({ n: 31, c: 4, h: { 100: 2, 200: 1, 250: 1 }, cc: { IE: { top: 250, c: 3 }, GB: { top: 100, c: 1 } } })],
  ['best', JSON.stringify({ p: 300, cc: 'GB', n: 20 })],
]);
const SCORES = { async get(k, t) { const v = kv.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, async put() { throw new Error('KV should not be written'); } };
const env = { DB, SCORES };

const START = Date.UTC(2026, 9, 2);
const today = Math.floor((Date.now() - START) / 864e5) + 1;
let failed = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failed++; };
const post = (n, p, cc = 'IE') => onRequestPost({ env, request: new Request('https://x/api/daily', { method: 'POST', headers: { 'cf-ipcountry': cc }, body: JSON.stringify({ n, p }) }) });
const get = n => onRequestGet({ env, request: new Request('https://x/api/daily?n=' + n) }).then(r => r.json());

// 1. 500 scores sent at the same moment: none lost
const scores = Array.from({ length: 500 }, (_, i) => (i % 60) * 5);
const res = await Promise.all(scores.map((p, i) => post(today, p, i % 3 ? 'IE' : 'GB')));
ok(res.every(r => r.status === 200), '500 scores at once all saved');
const b = await get(today);
const oldCount = today === 31 ? 4 : 0;
ok(b.count === 500 + oldCount, `count is ${500 + oldCount} (got ${b.count})`);
ok(Object.values(b.hist).reduce((a, c) => a + c, 0) === b.count, 'score spread adds up to the count');
ok(b.top && b.top.p === 295, `top score 295 (got ${b.top && b.top.p})`);
ok(b.best && b.best.p === 300 && b.best.cc === 'GB', 'old all-time best (300) carried over');

// 2. a new all-time best replaces it
await post(today, 360, 'IE');
ok((await get(today)).best.p === 360, 'new all-time best 360 recorded');
await post(today, 10, 'IE');
ok((await get(today)).best.p === 360, 'a lower score leaves the best alone');

// 3. old KV days still show
const d31 = await get(31);
ok(d31.count >= 4, `Daily #31 includes the 4 scores from before the switch (got ${d31.count})`);

// 4. bad requests turned away
ok((await post(today, 7)).status === 400, 'score not a multiple of 5 refused');
ok((await post(today, 365)).status === 400, 'score over 360 refused');
ok((await post(today - 5, 100)).status === 400, 'closed Daily refused');
ok((await onRequestPost({ env: {}, request: new Request('https://x/api/daily', { method: 'POST', body: '{}' }) })).status === 503, 'no database: polite 503, no crash');

console.log(failed ? `\n${failed} FAILED` : '\nAll Daily leaderboard tests passed');
process.exit(failed ? 1 : 0);
