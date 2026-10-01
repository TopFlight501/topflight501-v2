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

async function loadSeason(season) {
  if (!cache.has(season)) {
    const res = await fetch(`data/${season}.json`);
    if (!res.ok) throw new Error(`Could not load ${season}`);
    cache.set(season, await res.json());
  }
  return cache.get(season);
}

// Turn the compact record into something the game can use directly.
function expand(raw, D) {
  const players = raw.p.map(([id, side, goals, assists, card, started, og]) => {
    const [full, web] = D.players[id] || [String(id), ''];
    return { id, full, web, side, goals, assists, card, og: og || 0, started: started === undefined || started === -1 ? null : started === 1 };
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
  };
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
  const wanted = m => (!clubs.length || clubs.includes(m.h) || clubs.includes(m.a)) && (!opts.rich || rich(m));
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

export function seasonLabel(s) {
  // '2016-17' -> '2016/17'
  return s.replace('-', '/');
}
