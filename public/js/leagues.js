// Leagues and match history, saved only on this device (localStorage).

const KEY_LEAGUES = 'tf501:leagues';
const KEY_HISTORY = 'tf501:history';
const HISTORY_CAP = 1000;

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const nameKey = n => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function getLeagues() { return read(KEY_LEAGUES, []); }
export function getLeague(id) { return getLeagues().find(l => l.id === id) || null; }
export function getHistory() { return read(KEY_HISTORY, []); }

export function createLeague(name) {
  const leagues = getLeagues();
  const league = { id: uid(), name: String(name).trim().slice(0, 40) || 'My league', created: new Date().toISOString(), members: [] };
  leagues.push(league);
  write(KEY_LEAGUES, leagues);
  return league;
}

export function renameLeague(id, name) {
  const leagues = getLeagues();
  const l = leagues.find(x => x.id === id);
  if (l) { l.name = String(name).trim().slice(0, 40) || l.name; write(KEY_LEAGUES, leagues); }
}

export function deleteLeague(id) {
  write(KEY_LEAGUES, getLeagues().filter(l => l.id !== id));
  // keep the games in overall history, just unlink them
  write(KEY_HISTORY, getHistory().map(g => (g.league === id ? { ...g, league: null } : g)));
}

/**
 * Save a finished game.
 * entry: { game, players: [names], winner: name|null, solo: bool, league: id|null, detail: string }
 */
export function recordGame(entry) {
  const g = { id: uid(), at: new Date().toISOString(), ...entry };
  const history = getHistory();
  history.unshift(g);
  write(KEY_HISTORY, history.slice(0, HISTORY_CAP));
  if (g.league) {
    const leagues = getLeagues();
    const l = leagues.find(x => x.id === g.league);
    if (l) {
      for (const n of g.players) if (!l.members.some(m => nameKey(m) === nameKey(n))) l.members.push(n.trim());
      write(KEY_LEAGUES, leagues);
    }
  }
  return g;
}

export function leagueGames(id) { return getHistory().filter(g => g.league === id); }

// League table: played, won, win %, current form (last 5, newest first)
export function table(games) {
  const rows = new Map();
  const ordered = [...games].sort((a, b) => a.at.localeCompare(b.at));
  for (const g of ordered) {
    for (const n of g.players) {
      const k = nameKey(n);
      if (!rows.has(k)) rows.set(k, { name: n.trim(), p: 0, w: 0, form: [] });
      const r = rows.get(k);
      r.name = n.trim();
      r.p += 1;
      const won = g.winner && nameKey(g.winner) === k;
      if (won) r.w += 1;
      r.form.unshift(won ? 'W' : 'L');
    }
  }
  return [...rows.values()]
    .map(r => ({ ...r, pct: r.p ? Math.round((r.w / r.p) * 100) : 0, form: r.form.slice(0, 5) }))
    .sort((a, b) => b.w - a.w || b.pct - a.pct || a.p - b.p || a.name.localeCompare(b.name));
}

// Head-to-head between two names across the given games
export function headToHead(games, a, b) {
  const ka = nameKey(a), kb = nameKey(b);
  let aw = 0, bw = 0, played = 0;
  for (const g of games) {
    const keys = g.players.map(nameKey);
    if (!keys.includes(ka) || !keys.includes(kb)) continue;
    played += 1;
    const w = nameKey(g.winner);
    if (w === ka) aw += 1; else if (w === kb) bw += 1;
  }
  return { played, aw, bw };
}

export function allPairs(games) {
  const names = table(games).map(r => r.name);
  const out = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const h = headToHead(games, names[i], names[j]);
    if (h.played) out.push({ a: names[i], b: names[j], ...h });
  }
  return out.sort((x, y) => y.played - x.played);
}

export function knownNames() {
  const seen = new Map();
  for (const g of getHistory()) for (const n of g.players) if (!seen.has(nameKey(n))) seen.set(nameKey(n), n.trim());
  for (const l of getLeagues()) for (const n of l.members) if (!seen.has(nameKey(n))) seen.set(nameKey(n), n.trim());
  return [...seen.values()].filter(n => !/^(Player|Manager|Team) (One|Two|Three|Four)$|^Player$/.test(n));
}

// ---------- backup ----------
export function exportData() {
  const bests = {};
  for (const k of ['best:501', 'best:301', 'best:101', 'best:clock', 'best:sudden']) {
    try { const v = localStorage.getItem('tf501:' + k); if (v) bests[k] = JSON.parse(v); } catch { /* ignore */ }
  }
  let daily = {};
  try { daily = { log: JSON.parse(localStorage.getItem('tf501:dailyLog') || '{}'), today: JSON.parse(localStorage.getItem('tf501:daily') || 'null') }; } catch { /* ignore */ }
  return { app: 'topflight501', version: 1, exported: new Date().toISOString(), leagues: getLeagues(), history: getHistory(), bests, daily };
}

export function importData(data) {
  if (!data || data.app !== 'topflight501' || !Array.isArray(data.leagues) || !Array.isArray(data.history)) {
    throw new Error('That file isn’t a Top Flight 501 backup.');
  }
  const leagues = getLeagues();
  let addedLeagues = 0, addedGames = 0;
  for (const l of data.leagues) {
    if (!l || !l.id || !l.name) continue;
    const existing = leagues.find(x => x.id === l.id);
    if (existing) {
      for (const n of l.members || []) if (!existing.members.some(m => nameKey(m) === nameKey(n))) existing.members.push(n);
    } else { leagues.push({ id: l.id, name: String(l.name).slice(0, 40), created: l.created || new Date().toISOString(), members: Array.isArray(l.members) ? l.members.slice(0, 50) : [] }); addedLeagues++; }
  }
  const history = getHistory();
  const ids = new Set(history.map(g => g.id));
  for (const g of data.history) {
    if (!g || !g.id || ids.has(g.id) || !Array.isArray(g.players)) continue;
    history.push({ id: g.id, at: g.at, game: g.game, players: g.players.map(String), winner: g.winner ? String(g.winner) : null, solo: !!g.solo, league: g.league || null, detail: g.detail ? String(g.detail).slice(0, 120) : '' });
    addedGames++;
  }
  history.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  write(KEY_LEAGUES, leagues);
  write(KEY_HISTORY, history.slice(0, HISTORY_CAP));
  // Daily Match scores: keep the higher score for each day, so streaks and bests carry over
  let addedDays = 0;
  try {
    const inLog = data.daily && data.daily.log && typeof data.daily.log === 'object' ? data.daily.log : {};
    const log = JSON.parse(localStorage.getItem('tf501:dailyLog') || '{}');
    for (const [day, pts] of Object.entries(inLog)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || typeof pts !== 'number') continue;
      if (log[day] === undefined) addedDays++;
      if (log[day] === undefined || pts > log[day]) log[day] = pts;
    }
    localStorage.setItem('tf501:dailyLog', JSON.stringify(log));
    // today's game: bring it over if this device hasn't finished today's match
    const t = data.daily && data.daily.today, cur = JSON.parse(localStorage.getItem('tf501:daily') || 'null');
    if (t && t.done && t.key && (!cur || cur.key !== t.key || !cur.done)) localStorage.setItem('tf501:daily', JSON.stringify(t));
  } catch { /* ignore */ }
  for (const [k, v] of Object.entries(data.bests || {})) {
    if (!/^best:(501|301|101|clock|sudden)$/.test(k) || !v) continue;
    try {
      const cur = JSON.parse(localStorage.getItem('tf501:' + k) || 'null');
      const better = !cur || (k === 'best:sudden' ? v.points > cur.points : v.darts < cur.darts);
      if (better) localStorage.setItem('tf501:' + k, JSON.stringify(v));
    } catch { /* ignore */ }
  }
  return { addedLeagues, addedGames, addedDays };
}
