// Tests for the spam protection: the Turnstile bot check and the hourly cap on new nicknames and leagues.
// Cloudflare's check is faked here, so this runs offline.
//   node tools/test_spam.mjs
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as meApi } from '../functions/api/me.js';
import { onRequestPost as leaguesApi } from '../functions/api/leagues.js';
import { onRequestGet as humanApi } from '../functions/api/human.js';

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
  async batch(list) { sqlite.exec('BEGIN'); try { const o = list.map(s => s.exec()); sqlite.exec('COMMIT'); return o; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
};

// fake Cloudflare check: token 'good' passes, anything else fails, 'down' = Cloudflare unreachable
const realFetch = globalThis.fetch;
let checks = 0;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('siteverify')) {
    checks++;
    const t = opts.body.get('response');
    if (opts.body.has('remoteip')) throw new Error('IP address should never be sent');
    if (t === 'down') throw new Error('unreachable');
    return new Response(JSON.stringify({ success: t === 'good' }));
  }
  return realFetch(url, opts);
};

let failed = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) failed++; };
const call = (fn, env, b, key) => fn({ env, request: new Request('https://x/api', { method: 'POST', headers: key ? { 'x-tf-key': key } : {}, body: JSON.stringify(b) }) });
let n = 0;
const NAMES = ['Leesider', 'Rebel Fan', 'Darts King', 'Top Bin', 'Back Post', 'Near Post', 'Far Post', 'Volley', 'Header', 'Nutmeg', 'Rabona', 'Panenka', 'Bicycle', 'Scorpion', 'Rainbow', 'Stepover', 'Cruyff Turn', 'Elastico', 'Chip Shot', 'Tiki Taka'];
const nick = () => NAMES[n++];

// 1. switched off (no secret): works with no token, and the site is told there's no key
const off = { DB };
ok((await call(meApi, off, { action: 'create', nick: nick() })).status === 200, 'check off: nickname made without a token');
ok((await (await humanApi({ env: off })).json()).key === '', 'check off: site gets an empty key');

// 2. switched on
const on = { DB, TURNSTILE_SECRET: 'secret', TURNSTILE_SITEKEY: 'site-key' };
ok((await (await humanApi({ env: on })).json()).key === 'site-key', 'check on: site gets the public key');
ok((await call(meApi, on, { action: 'create', nick: nick() })).status === 403, 'check on: no token refused');
ok((await call(meApi, on, { action: 'create', nick: nick(), ts: 'bad' })).status === 403, 'check on: failed check refused');
const made = await call(meApi, on, { action: 'create', nick: nick(), ts: 'good' });
ok(made.status === 200, 'check on: passed check makes the nickname');
const { code, me } = await made.json();
ok((await call(meApi, on, { action: 'create', nick: nick(), ts: 'down' })).status === 200, 'Cloudflare unreachable: let through, site keeps working');

// renaming needs the check, changing only the colour doesn't
ok((await call(meApi, on, { action: 'update', nick: nick(), club: '' }, code)).status === 403, 'rename without a check refused');
ok((await call(meApi, on, { action: 'update', nick: nick(), club: '', ts: 'good' }, code)).status === 200, 'rename with a check works');
const current = (await (await call(meApi, on, { action: 'update', club: 'Arsenal' }, code)).json()).me;
ok(current && current.club === 'Arsenal', 'colour-only change needs no check');
ok((await call(meApi, on, { action: 'update', nick: current.nick, club: 'Chelsea' }, code)).status === 200, 'same nickname sent back with a new colour needs no check');

// leagues
ok((await call(leaguesApi, on, { action: 'create', name: 'Cork Lads' }, code)).status === 403, 'league without a check refused');
ok((await call(leaguesApi, on, { action: 'create', name: 'Cork Lads', ts: 'good' }, code)).status === 200, 'league with a check made');

// 3. hourly cap
checks = 0;
const capped = { DB, NICK_CAP: '8', LEAGUE_CAP: '1' };
const made8 = (await sqlite.prepare('SELECT COUNT(*) AS n FROM players').get()).n;
let last;
for (let i = made8; i <= 8; i++) { last = await call(meApi, capped, { action: "create", nick: nick() }); if (last.status !== 200 && i < 8) ok(false, `nickname ${i + 1} should have been made (${last.status})`); }
ok(last.status === 429, `nickname ${9} in an hour stopped by a cap of 8`);
ok((await last.json()).error.includes('Try again in a few minutes'), 'friendly message when the cap is hit');
ok((await call(leaguesApi, capped, { action: 'create', name: 'Second League' }, code)).status === 429, 'league cap stops extra leagues');
// an hour later it opens again
sqlite.prepare('UPDATE players SET created = created - 3700000').run();
ok((await call(meApi, capped, { action: 'create', nick: nick() })).status === 200, 'an hour later new nicknames work again');
// existing players aren't affected by the cap
ok((await call(meApi, capped, { action: 'update', club: 'Fulham' }, code)).status === 200, 'existing nickname still works during the cap');

console.log(failed ? `\n${failed} FAILED` : '\nAll spam protection tests passed');
process.exit(failed ? 1 : 0);
