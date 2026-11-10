// Shared server code for nicknames, online leagues, league Daily scores and challenge results.
// Runs as Cloudflare Pages Functions on a D1 database (binding: DB). The site creates its own tables.
//
// What is stored: a nickname, a club colour, Daily Match scores, league memberships, challenge results
// and the player's own game progress (streak, achievements, personal bests, stats).
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
  // seasons: the fixture list for each season of a league ('' away = a bye week)
  `CREATE TABLE IF NOT EXISTS fixtures (league TEXT NOT NULL, season INTEGER NOT NULL, gw INTEGER NOT NULL, home TEXT NOT NULL, away TEXT NOT NULL, PRIMARY KEY (league, season, gw, home))`,
  // club Daily Match scores, for leagues that only use one club's matches
  `CREATE TABLE IF NOT EXISTS cscores (player TEXT NOT NULL, club TEXT NOT NULL, n INTEGER NOT NULL, p INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (player, club, n))`,
  `CREATE INDEX IF NOT EXISTS players_club ON players (club)`,
  // the anonymous Daily Match leaderboard: running counts per day, score and country (no players)
  `CREATE TABLE IF NOT EXISTS dagg (n INTEGER NOT NULL, p INTEGER NOT NULL, cc TEXT NOT NULL, c INTEGER NOT NULL, PRIMARY KEY (n, p, cc))`,
  `CREATE INDEX IF NOT EXISTS players_created ON players (created)`,
  `CREATE INDEX IF NOT EXISTS leagues_created ON leagues (created)`,
  `CREATE TABLE IF NOT EXISTS dbest (id INTEGER PRIMARY KEY, p INTEGER NOT NULL, cc TEXT NOT NULL, n INTEGER NOT NULL)`,
  // a player's saved progress (streak, achievements, bests, stats) and career points, so a new phone gets it back
  `CREATE TABLE IF NOT EXISTS progress (player TEXT PRIMARY KEY, data TEXT NOT NULL, pts INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL)`,
];
// columns added after launch day; each is tried once and skipped if it's already there
const COLUMNS = [
  "ALTER TABLE leagues ADD COLUMN format TEXT NOT NULL DEFAULT 'open'",
  'ALTER TABLE leagues ADD COLUMN weeks INTEGER NOT NULL DEFAULT 0',
  "ALTER TABLE leagues ADD COLUMN club TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE leagues ADD COLUMN season INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE leagues ADD COLUMN start_n INTEGER NOT NULL DEFAULT 0',
  "ALTER TABLE leagues ADD COLUMN status TEXT NOT NULL DEFAULT 'open'",
  "ALTER TABLE leagues ADD COLUMN champs TEXT NOT NULL DEFAULT '[]'",
];
async function migrate(DB) {
  await DB.batch(SCHEMA.map(s => DB.prepare(s)));
  const have = new Set(((await DB.prepare('PRAGMA table_info(leagues)').all()).results || []).map(c => c.name));
  for (const c of COLUMNS) {
    const col = c.match(/ADD COLUMN (\w+)/)[1];
    if (!have.has(col)) { try { await DB.prepare(c).run(); } catch (e) { if (!/duplicate column/i.test(String(e && e.message))) throw e; } }
  }
}
let ready = null;
export async function db(env) {
  if (!env.DB) throw new Response(JSON.stringify({ error: 'Online leagues aren’t switched on yet.', why: 'off' }), { status: 503, headers: { 'content-type': 'application/json' } });
  if (!ready) ready = migrate(env.DB).catch(e => { ready = null; throw e; });
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

// ---------- spam protection ----------
// Cloudflare Turnstile (free bot check). Switched on by adding two settings in Cloudflare Pages:
// TURNSTILE_SITEKEY (public) and TURNSTILE_SECRET (secret). Until then nothing is checked.
// We don't send Cloudflare the player's IP address.
export async function checkHuman(env, token) {
  if (!env.TURNSTILE_SECRET) return;
  if (!token || typeof token !== 'string' || token.length > 2048) throw fail('Couldn’t check you’re not a robot. Try again.', 403, 'human');
  let r = null;
  try {
    const form = new FormData();
    form.append('secret', env.TURNSTILE_SECRET);
    form.append('response', token);
    r = await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })).json();
  } catch (e) {
    console.error('Turnstile check unreachable', e);
    return;   // if Cloudflare's check is down, let people through rather than break the site
  }
  if (!r || !r.success) throw fail('Couldn’t check you’re not a robot. Try again.', 403, 'human');
}

// A ceiling on new nicknames and leagues per hour across the whole site, so a bot can't flood it.
// Normal players are never near it. Change with NICK_CAP / LEAGUE_CAP in Cloudflare if ever needed.
export async function checkCap(DB, env, what) {
  const cap = what === 'league' ? Number(env.LEAGUE_CAP) || 60 : Number(env.NICK_CAP) || 300;
  const table = what === 'league' ? 'leagues' : 'players';
  const n = (await DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE created > ?`).bind(Date.now() - 3600e3).first()).n;
  if (n >= cap) {
    console.warn(`Spam cap reached: ${n} new ${table} in the last hour`);
    throw fail(`Loads of new ${what === 'league' ? 'leagues' : 'nicknames'} right now! Try again in a few minutes.`, 429, 'busy');
  }
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
    DB.prepare('DELETE FROM cscores WHERE player = ?').bind(id),
    DB.prepare('DELETE FROM members WHERE player = ?').bind(id),
    DB.prepare('DELETE FROM progress WHERE player = ?').bind(id),
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
// Clubs with three or more Premier League seasons in the database (95+ usable matches) can have club-only leagues;
// shorter stays would run out of fresh matches for a daily game within weeks. Update when adding a season.
export const CLUB_DAILY = ['Arsenal', 'Aston Villa', 'Bournemouth', 'Brentford', 'Brighton & Hove Albion', 'Burnley', 'Chelsea', 'Crystal Palace',
  'Everton', 'Fulham', 'Leeds United', 'Leicester City', 'Liverpool', 'Manchester City', 'Manchester United', 'Newcastle United',
  'Nottingham Forest', 'Sheffield United', 'Southampton', 'Tottenham Hotspur', 'Watford', 'West Bromwich Albion', 'West Ham United', 'Wolverhampton Wanderers'];
export const cleanClubDaily = c => (CLUB_DAILY.includes(c) ? c : '');

// ---------- challenges ----------
export const VS_GAMES = ['x01', 'clock', 'sudden'];
// darts: fewer is better; Sudden Death points: more is better. Returns 1 if a beat b, 0 for a draw, -1 if b won.
export const beats = (g, a, b) => (a === b ? 0 : (g === 'sudden' ? a > b : a < b) ? 1 : -1);
