// Loads the verified match database (one JSON file per season) and hands out random matches.
// Each season file: { season, players: { id: [fullName, webName] }, matches: [...] }
// Match: { id, d: 'YYYY-MM-DD', h: home, a: away, s: [homeGoals, awayGoals], m: [homeManager, awayManager],
//          p: [[playerId, side(0 home / 1 away), goals, assists, card(0 none / 1 yellow / 2 red), started(1/0, -1 unknown), ownGoals?]] }

const cache = new Map();
let seasonList = null;
// Matches already shown on this device, remembered between visits so the same game doesn't keep coming back.
const SEEN_KEY = 'tf501:seen', SEEN_MAX = 600;
const used = new Set((() => { try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || []; } catch { return []; } })());
function saveSeen() { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...used].slice(-SEEN_MAX))); } catch { /* ignore */ } }

export async function getSeasons() {
  if (!seasonList) {
    const res = await fetch('data/seasons.json');
    if (!res.ok) throw new Error('Could not load the season list');
    seasonList = await res.json();
  }
  return seasonList;
}

// Player background for the Pundit's clue: { code: [birthDate, [[season, club], ...]] }
let people = null;
export async function getPeople() {
  if (!people) {
    try { const r = await fetch('data/people.json?v=1'); people = r.ok ? await r.json() : {}; } catch { people = {}; }
  }
  return people;
}

async function loadSeason(season) {
  if (!cache.has(season)) {
    const res = await fetch(`data/${season}.json?v=3`);
    if (!res.ok) throw new Error(`Could not load ${season}`);
    cache.set(season, await res.json());
  }
  return cache.get(season);
}

// Turn the compact record into something the game can use directly.
function expand(raw, D) {
  const players = raw.p.map(([id, side, goals, assists, card, started, og]) => {
    const [full, web] = D.players[id] || [String(id), ''];
    const [pos, code] = (D.pi && D.pi[id]) || [0, 0];
    return { id, full, web, side, goals, assists, card, og: og || 0, pos, code, started: started === undefined || started === -1 ? null : started === 1 };
  });
  return {
    id: raw.id,
    season: D.season,
    date: raw.d,
    home: raw.h,
    away: raw.a,
    score: raw.s,
    managers: raw.m,
    players,
    decoys: decoys(raw, D),
  };
}

// Wrong options for Easy mode: real players and managers from the same season who weren't in this match.
function decoys(raw, D) {
  const inMatch = new Set(raw.p.map(x => String(x[0])));
  const ids = Object.keys(D.players).filter(id => !inMatch.has(id));
  const names = shuffle(ids).slice(0, 12).map(id => { const [full, web] = D.players[id]; return { id, full, web }; });
  const mine = new Set((raw.m || []).flatMap(m => String(m || '').split(' / ')));
  const mgr = [...new Set(D.matches.flatMap(m => m.m || []).filter(Boolean))].filter(m => !m.split(' / ').some(n => mine.has(n)));
  return { players: names, managers: shuffle(mgr).slice(0, 6) };
}

function shuffle(a, rnd = Math.random) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- Daily Match: the same match for everyone on the same day ----------
const DAILY_START = Date.UTC(2026, 9, 2);   // Daily #1 = 2 October 2026
export function dailyNumber(d = new Date()) {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - DAILY_START) / 864e5) + 1;
}
export function dailyKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function seeded(n) {
  let a = (n * 2654435761) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DAILY_SEASONS = ['2016-17', '2017-18', '2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26'];  // fixed so past days never change
export async function dailyMatch(n = dailyNumber()) {
  const rnd = seeded(n + 501);
  const all = await getSeasons();
  const seasons = DAILY_SEASONS.filter(s => all.includes(s));
  const season = seasons[Math.floor(rnd() * seasons.length)];
  const D = await loadSeason(season);
  // a match with something in every category, sorted so the pick is stable
  const ok = D.matches.filter(m => m.s[0] + m.s[1] > 0 && m.p.some(x => x[3] > 0) && m.p.some(x => x[4] > 0)).sort((x, y) => (x.id < y.id ? -1 : 1));
  const raw = ok[Math.floor(rnd() * ok.length)];
  const m = expand(raw, D);
  // decoys must be the same for everyone too
  const r2 = seeded(n + 77);
  const inMatch = new Set(raw.p.map(x => String(x[0])));
  const ids = Object.keys(D.players).filter(id => !inMatch.has(id)).sort();
  m.decoys.players = shuffle(ids, r2).slice(0, 12).map(id => { const [full, web] = D.players[id]; return { id, full, web }; });
  return m;
}

// A club's own Daily Match, for leagues that only use one club's matches: the same match for every fan that day.
// Each club's usable matches are shuffled once into a fixed order and played through, so none repeats
// until all have been used (95+ days even for the smallest eligible clubs).
const strHash = str => [...str].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const clubOrder = new Map();
export async function clubDailyMatch(n, club) {
  if (!clubOrder.has(club)) {
    const map = await getClubs();
    const seasons = DAILY_SEASONS.filter(s => (map[s] || []).includes(club));
    const list = [];
    for (const season of seasons) {
      const D = await loadSeason(season);
      for (const m of D.matches) if ((m.h === club || m.a === club) && m.s[0] + m.s[1] > 0 && m.p.some(x => x[3] > 0) && m.p.some(x => x[4] > 0)) list.push(m.id);
    }
    if (!list.length) throw new Error('No matches for that club');
    clubOrder.set(club, shuffle(list.sort(), seeded(strHash(club))));
  }
  const order = clubOrder.get(club);
  const id = order[(n - 1) % order.length];
  const D = await loadSeason(id.slice(0, 7));
  const raw = D.matches.find(m => m.id === id);
  const m = expand(raw, D);
  const r2 = seeded(n * 97 + 13);
  const inMatch = new Set(raw.p.map(x => String(x[0])));
  const ids = Object.keys(D.players).filter(x => !inMatch.has(x)).sort();
  m.decoys.players = shuffle(ids, r2).slice(0, 12).map(x => { const [full, web] = D.players[x]; return { id: x, full, web }; });
  return m;
}

let clubMap = null;
export async function getClubs() {
  if (!clubMap) {
    const res = await fetch('data/clubs.json');
    if (!res.ok) throw new Error('Could not load the club list');
    clubMap = await res.json();
  }
  return clubMap;
}

// Clubs that played in at least one of the given seasons, A-Z.
export async function clubsIn(seasons) {
  const map = await getClubs();
  const set = new Set();
  for (const s of seasons) (map[s] || []).forEach(c => set.add(c));
  return [...set].sort();
}

// clubs: optional list of club names; only matches involving one of them are picked.
// opts.rich: only matches with at least one goal, one assist and one booking
export async function randomMatch(seasons, clubs = [], opts = {}, retried = false) {
  let pool = seasons && seasons.length ? seasons : await getSeasons();
  if (clubs.length) {
    const map = await getClubs();
    pool = pool.filter(s => (map[s] || []).some(c => clubs.includes(c)));
    if (!pool.length) throw new Error('None of those clubs played in the chosen seasons.');
  }
  const rich = m => m.s[0] + m.s[1] > 0 && m.p.some(x => x[3] > 0) && m.p.some(x => x[4] > 0);
  // opts.famous (Quick play): well-known games for an easy first taste. Big-six clashes, or a big-six side in a game with 3+ goals
  const BIG = ['Arsenal', 'Chelsea', 'Liverpool', 'Manchester City', 'Manchester United', 'Tottenham Hotspur'];
  const famous = m => { const b = BIG.includes(m.h) + BIG.includes(m.a); return m.s[0] + m.s[1] > 0 && (b === 2 || (b === 1 && m.s[0] + m.s[1] >= 3)); };
  const wanted = m => (!clubs.length || clubs.includes(m.h) || clubs.includes(m.a)) && (!opts.rich || rich(m)) && (!opts.famous || famous(m));
  for (let attempt = 0; attempt < 40; attempt++) {
    const season = pool[Math.floor(Math.random() * pool.length)];
    const D = await loadSeason(season);
    const fresh = D.matches.filter(m => wanted(m) && !used.has(m.id));
    if (!fresh.length) continue;
    const raw = fresh[Math.floor(Math.random() * fresh.length)];
    used.delete(raw.id); used.add(raw.id); saveSeen();
    return expand(raw, D);
  }
  if (retried) throw new Error('No matches found.');
  [...used].slice(0, Math.ceil(used.size / 2)).forEach(id => used.delete(id)); saveSeen();
  return randomMatch(seasons, clubs, opts, true);
}

// A specific match by id (e.g. '2023-24-15'), for challenge links: both players get the exact same matches.
export async function matchById(id) {
  const D = await loadSeason(id.slice(0, 7));
  const raw = D.matches.find(m => m.id === id);
  if (!raw) throw new Error('Match not found');
  used.delete(raw.id); used.add(raw.id); saveSeen();
  return expand(raw, D);
}

export function seasonLabel(s) {
  // '2016-17' -> '2016/17'
  return s.replace('-', '/');
}

// ---------- 🔍 Match clues: what was known before kick-off (never what happened in the match) ----------
// The table and form going into the match, each side's top scorer so far, the occasion, and the last time they met.
const LONDON = new Set(['Arsenal', 'Chelsea', 'Tottenham Hotspur', 'West Ham United', 'Crystal Palace', 'Fulham', 'Brentford']);
const DERBIES = [
  [['Arsenal', 'Tottenham Hotspur'], 'North London derby'], [['Liverpool', 'Everton'], 'Merseyside derby'],
  [['Manchester City', 'Manchester United'], 'Manchester derby'], [['Newcastle United', 'Sunderland'], 'Tyne–Wear derby'],
  [['Aston Villa', 'Wolverhampton Wanderers'], 'Midlands derby'], [['Aston Villa', 'West Bromwich Albion'], 'Midlands derby'],
  [['Wolverhampton Wanderers', 'West Bromwich Albion'], 'Black Country derby'], [['Nottingham Forest', 'Leicester City'], 'East Midlands derby'],
  [['Southampton', 'Bournemouth'], 'South Coast derby'], [['Brighton & Hove Albion', 'Crystal Palace'], 'M23 derby'],
  [['Leeds United', 'Manchester United'], 'Roses rivalry'], [['Sheffield United', 'Leeds United'], 'Yorkshire derby'],
];
function runOf(form) {
  // the current run: wins in a row, unbeaten, defeats in a row, or games without a win
  let wins = 0, unbeaten = 0, losses = 0, winless = 0;
  for (let i = form.length - 1; i >= 0 && form[i] === 'W'; i--) wins++;
  for (let i = form.length - 1; i >= 0 && form[i] !== 'L'; i--) unbeaten++;
  for (let i = form.length - 1; i >= 0 && form[i] === 'L'; i--) losses++;
  for (let i = form.length - 1; i >= 0 && form[i] !== 'W'; i--) winless++;
  if (wins >= 3) return `🔥 ${wins} wins in a row`;
  if (unbeaten >= 5) return `🛡️ Unbeaten in ${unbeaten}`;
  if (losses >= 3) return `📉 ${losses} defeats in a row`;
  if (winless >= 5) return `😬 ${winless} without a win`;
  return null;
}
function moodOf(pos, teams, pl) {
  if (pl < 3) return null;
  if (pos === 1) return '👑 Top';
  if (pos <= 4) return '⭐ Top four';
  if (pos === teams) return '🥶 Bottom';
  if (pos > teams - 3) return '😰 Drop zone';
  return null;
}
function occasionOf(m, opening, finalDay) {
  const tags = [];
  const pair = [m.home, m.away];
  const derby = DERBIES.find(([d]) => d.every(c => pair.includes(c)));
  if (derby) tags.push(`⚔️ ${derby[1]}`);
  else if (pair.every(c => LONDON.has(c))) tags.push('⚔️ London derby');
  const md = m.date.slice(5);
  if (opening) tags.push('🏁 Opening weekend');
  if (finalDay) tags.push('🏁 Final day of the season');
  if (md === '12-26') tags.push('🎄 Boxing Day');
  else if (md === '01-01') tags.push('🎆 New Year’s Day');
  else if (md >= '12-20' || md <= '01-03') tags.push('🎄 Festive fixtures');
  if (m.date >= '2020-06-17' && m.date <= '2021-05-17') tags.push('🔇 Lockdown, no crowd');
  const day = new Date(m.date + 'T12:00:00Z').getUTCDay();
  if (day >= 2 && day <= 4) tags.push('🌙 Midweek game');
  else if (day === 1) tags.push('📺 Monday night');
  else if (day === 5) tags.push('📺 Friday night');
  return tags;
}
export async function matchContext(m) {
  const D = await loadSeason(m.season);
  const clubs = (await getClubs())[m.season] || [];
  const before = D.matches.filter(x => x.d < m.date).sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
  const rows = new Map(clubs.map(c => [c, { club: c, pts: 0, gd: 0, gf: 0, pl: 0, form: [], goals: new Map() }]));
  for (const x of before) {
    const [hg, ag] = x.s;
    [[x.h, hg, ag], [x.a, ag, hg]].forEach(([club, f, a], side) => {
      const r = rows.get(club); if (!r) return;
      r.pl += 1; r.gf += f; r.gd += f - a;
      r.pts += f > a ? 3 : f === a ? 1 : 0;
      r.form.push(f > a ? 'W' : f === a ? 'D' : 'L');
      for (const [id, s, g] of x.p) if (s === side && g > 0) r.goals.set(id, (r.goals.get(id) || 0) + g);
    });
  }
  const table = [...rows.values()].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.club.localeCompare(b.club));
  const side = club => {
    const i = table.findIndex(r => r.club === club), r = table[i] || { pts: 0, pl: 0, form: [], goals: new Map() };
    let hot = null;
    for (const [id, g] of r.goals) if (!hot || g > hot.goals) hot = { id, goals: g };
    if (hot) { const [full, web] = D.players[hot.id] || []; hot = { name: web || full, goals: hot.goals }; }
    return { pos: i + 1, pts: r.pts, pl: r.pl, form: r.form.slice(-5), run: runOf(r.form), mood: moodOf(i + 1, clubs.length, r.pl), hot };
  };
  const home = side(m.home), away = side(m.away);
  // last league meeting: earlier this season, or failing that the season before
  const meets = list => list.filter(x => (x.h === m.home && x.a === m.away) || (x.h === m.away && x.a === m.home));
  let last = meets(before).pop() || null;
  if (!last) {
    const seasons = await getSeasons(), i = seasons.indexOf(m.season);
    if (i > 0) { try { last = meets((await loadSeason(seasons[i - 1])).matches).sort((x, y) => (x.d < y.d ? -1 : 1)).pop() || null; } catch { /* offline: skip it */ } }
  }
  const opening = home.pl === 0 && away.pl === 0;
  const finalDay = home.pl === clubs.length * 2 - 3 && away.pl === clubs.length * 2 - 3;
  return {
    home, away, teams: clubs.length, opening, finalDay,
    occasion: occasionOf(m, opening, finalDay),
    gameNo: home.pl + 1,
    last: last && { date: last.d, home: last.h, away: last.a, score: last.s },
  };
}
