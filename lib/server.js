// Shared server code for nicknames, online leagues, league Daily scores and challenge results.
// Runs as Cloudflare Pages Functions on a D1 database (binding: DB). The site creates its own tables.
//
// What is stored: a nickname, a club colour, Daily Match scores, league memberships and challenge results.
// No emails, real names, passwords, ages, locations or IP addresses.

export const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
export const fail = (msg, status = 400, why = '') => json({ error: msg, why }, status);

// ---------- Daily Match numbers (same rule as /api/daily) ----------
export const DAILY_START = Date.UTC(2026, 9, 2);   // Daily #1 = Friday 2 October 2026
export const dayNow = () => Math.floor((Date.now() - DAILY_START) / 864e5) + 1;
export const dayOf = t => Math.floor((t - DAILY_START) / 864e5) + 1;
// the Daily number of this week's Monday
export function weekStartN(n = dayNow()) {
  const dow = (new Date(DAILY_START + (n - 1) * 864e5).getUTCDay() + 6) % 7;   // Monday = 0
  return n - dow;
}

// ---------- codes ----------
// No 0/O, 1/I/L, so codes are easy to read out and type
const ALPH = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function randCode(len) {
  let out = '';
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) {
      if (b < 248 && out.length < len) out += ALPH[b % ALPH.length];   // 248 = 8 × 31: no bias
    }
  }
  return out;
}
export const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
// recovery codes: 12 characters, shown as K7QM-2XDR-9PWA
export const newRecovery = () => randCode(12).replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3');
export const cleanRecovery = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
export const cleanLeague = s => { const c = String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^TF/, ''); return /^[2-9A-HJKMNP-Z]{5}$/.test(c) ? c : null; };
export const showLeague = c => `TF-${c}`;
export async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- database ----------
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, nick TEXT NOT NULL, nick_key TEXT NOT NULL UNIQUE, club TEXT NOT NULL DEFAULT '', secret TEXT NOT NULL UNIQUE, created INTEGER NOT NULL, seen INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS leagues (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, owner TEXT NOT NULL, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS members (league TEXT NOT NULL, player TEXT NOT NULL, joined INTEGER NOT NULL, PRIMARY KEY (league, player))`,
  `CREATE INDEX IF NOT EXISTS members_player ON members (player)`,
  `CREATE TABLE IF NOT EXISTS dscores (player TEXT NOT NULL, n INTEGER NOT NULL, p INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (player, n))`,
  `CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, player TEXT NOT NULL, g TEXT NOT NULL, s INTEGER NOT NULL, e INTEGER NOT NULL, r INTEGER NOT NULL, m TEXT NOT NULL, created INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS challenges_player ON challenges (player)`,
  `CREATE TABLE IF NOT EXISTS results (chal TEXT NOT NULL, player TEXT NOT NULL, r INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (chal, player))`,
  `CREATE INDEX IF NOT EXISTS results_player ON results (player)`,
  `CREATE TABLE IF NOT EXISTS reports (kind TEXT NOT NULL, target TEXT NOT NULL, by TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (kind, target, by))`,
];
let ready = null;
export async function db(env) {
  if (!env.DB) throw new Response(JSON.stringify({ error: 'Online leagues aren’t switched on yet.', why: 'off' }), { status: 503, headers: { 'content-type': 'application/json' } });
  if (!ready) ready = env.DB.batch(SCHEMA.map(s => env.DB.prepare(s))).catch(e => { ready = null; throw e; });
  await ready;
  if (Math.random() < 0.02) tidyUp(env.DB).catch(() => {});
  return env.DB;
}
// Wrap a handler so a missing database or a thrown Response becomes a tidy reply
export const handle = fn => async ctx => {
  try { return await fn(ctx); }
  catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return fail('Something went wrong. Try again in a minute.', 500, 'server');
  }
};

// Nicknames nobody has used for 12 months are deleted, with everything linked to them.
// Unanswered challenges older than 60 days are dropped.
async function tidyUp(DB) {
  const cutoff = Date.now() - 365 * 864e5;
  const old = await DB.prepare('SELECT id FROM players WHERE seen < ? LIMIT 50').bind(cutoff).all();
  for (const r of old.results || []) await deletePlayer(DB, r.id);
  await DB.prepare('DELETE FROM challenges WHERE created < ? AND id NOT IN (SELECT chal FROM results)').bind(Date.now() - 60 * 864e5).run();
}

// ---------- who's asking ----------
// The phone sends its recovery code in the x-tf-key header. We only keep a scrambled (hashed) copy of it.
export async function who(DB, request, required = true) {
  const key = cleanRecovery(request.headers.get('x-tf-key'));
  if (key.length === 12) {
    const me = await DB.prepare('SELECT id, nick, club, seen FROM players WHERE secret = ?').bind(await sha(key)).first();
    if (me) {
      if (me.seen < Date.now() - 12 * 3600e3) await DB.prepare('UPDATE players SET seen = ? WHERE id = ?').bind(Date.now(), me.id).run();
      return me;
    }
  }
  if (required) throw fail('We don’t recognise this phone. Pick a nickname or enter your recovery code.', 401, 'auth');
  return null;
}

export async function body(request) {
  try { const b = await request.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; }
}

// ---------- removing a player completely ----------
export async function deletePlayer(DB, id) {
  // leagues they run pass to the longest-standing member, or close if nobody's left
  const owned = await DB.prepare('SELECT id FROM leagues WHERE owner = ?').bind(id).all();
  for (const l of owned.results || []) {
    const next = await DB.prepare('SELECT player FROM members WHERE league = ? AND player != ? ORDER BY joined LIMIT 1').bind(l.id, id).first();
    if (next) await DB.prepare('UPDATE leagues SET owner = ? WHERE id = ?').bind(next.player, l.id).run();
    else await DB.batch([DB.prepare('DELETE FROM members WHERE league = ?').bind(l.id), DB.prepare('DELETE FROM leagues WHERE id = ?').bind(l.id)]);
  }
  await DB.batch([
    DB.prepare('DELETE FROM results WHERE player = ? OR chal IN (SELECT id FROM challenges WHERE player = ?)').bind(id, id),
    DB.prepare('DELETE FROM challenges WHERE player = ?').bind(id),
    DB.prepare('DELETE FROM dscores WHERE player = ?').bind(id),
    DB.prepare('DELETE FROM members WHERE player = ?').bind(id),
    DB.prepare("DELETE FROM reports WHERE by = ? OR (kind = 'player' AND target = ?)").bind(id, id),
    DB.prepare('DELETE FROM players WHERE id = ?').bind(id),
  ]);
}

// ---------- clubs (colour choices; plain colours only, no badges) ----------
export const CLUBS = ['Arsenal', 'Aston Villa', 'Bournemouth', 'Brentford', 'Brighton & Hove Albion', 'Burnley', 'Cardiff City', 'Chelsea',
  'Crystal Palace', 'Everton', 'Fulham', 'Huddersfield Town', 'Hull City', 'Ipswich Town', 'Leeds United', 'Leicester City', 'Liverpool',
  'Luton Town', 'Manchester City', 'Manchester United', 'Middlesbrough', 'Newcastle United', 'Norwich City', 'Nottingham Forest',
  'Sheffield United', 'Southampton', 'Stoke City', 'Sunderland', 'Swansea City', 'Tottenham Hotspur', 'Watford', 'West Bromwich Albion',
  'West Ham United', 'Wolverhampton Wanderers'];
export const cleanClub = c => (CLUBS.includes(c) ? c : '');

// ---------- challenges ----------
export const VS_GAMES = ['x01', 'clock', 'sudden'];
// darts: fewer is better; Sudden Death points: more is better. Returns 1 if a beat b, 0 for a draw, -1 if b won.
export const beats = (g, a, b) => (a === b ? 0 : (g === 'sudden' ? a > b : a < b) ? 1 : -1);
