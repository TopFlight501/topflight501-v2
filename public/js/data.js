// Loads the verified match database (one JSON file per season) and hands out random matches.
// Each season file: { season, players: { id: [fullName, webName] }, matches: [...] }
// Match: { id, d: 'YYYY-MM-DD', h: home, a: away, s: [homeGoals, awayGoals], m: [homeManager, awayManager],
//          p: [[playerId, side(0 home / 1 away), goals, assists, card(0 none / 1 yellow / 2 red), started?]] }

const cache = new Map();
let seasonList = null;
const used = new Set();

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
  const players = raw.p.map(([id, side, goals, assists, card, started]) => {
    const [full, web] = D.players[id] || [String(id), ''];
    return { id, full, web, side, goals, assists, card, started: started === undefined ? null : started === 1 };
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

export async function randomMatch(seasons) {
  const pool = seasons && seasons.length ? seasons : await getSeasons();
  for (let attempt = 0; attempt < 30; attempt++) {
    const season = pool[Math.floor(Math.random() * pool.length)];
    const D = await loadSeason(season);
    const fresh = D.matches.filter(m => !used.has(m.id));
    if (!fresh.length) continue;
    const raw = fresh[Math.floor(Math.random() * fresh.length)];
    used.add(raw.id);
    return expand(raw, D);
  }
  used.clear();
  return randomMatch(seasons);
}

export function seasonLabel(s) {
  // '2016-17' -> '2016/17'
  return s.replace('-', '/');
}
