// Seasons: league formats, the fixture draw, gameweeks and the league table.
// A gameweek is Monday to Sunday. Each fixture is won by whoever scores more Daily Match points that week
// (first go each day), like head-to-head fantasy football. Win 3, draw 1, loss 0.
import { dayNow, weekStartN } from './server.js';

export const FORMATS = {
  open:   { label: 'Open table', season: false },
  full:   { label: 'Full season', season: true },    // everyone plays everyone home and away
  half:   { label: 'Half season', season: true },    // everyone plays everyone once
  sprint: { label: 'Sprint', season: true },         // a set number of gameweeks
};
export const SPRINT_WEEKS = [4, 6, 10];
export const SEASON_MAX = 20;   // like the Premier League: 20 players = 38 gameweeks home and away

// Circle method: everyone meets everyone once. Returns rounds of [home, away] pairs; '' is a bye.
// Home and away go to whoever has had fewer home games so far, so they even out.
export function roundRobin(ids) {
  const p = ids.slice();
  if (p.length % 2) p.push('');
  const n = p.length, rounds = [], homes = new Map(ids.map(id => [id, 0]));
  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) {
      let a = p[i], b = p[n - 1 - i];
      if (a === '' || b === '') { games.push([a || b, '']); continue; }   // the player with a bye is listed first
      if (homes.get(a) > homes.get(b) || (homes.get(a) === homes.get(b) && (r + i) % 2)) [a, b] = [b, a];
      homes.set(a, homes.get(a) + 1);
      games.push([a, b]);
    }
    rounds.push(games);
    p.splice(1, 0, p.pop());
  }
  return rounds;
}

export function drawFixtures(ids, format, weeks) {
  const once = roundRobin(ids);
  const twice = [...once, ...once.map(r => r.map(([a, b]) => (b === '' ? [a, b] : [b, a])))];
  if (format === 'half') return once;
  if (format === 'full') return twice;
  const out = [];
  while (out.length < weeks) out.push(...twice);
  return out.slice(0, weeks);
}

export const shuffled = a => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Gameweek g runs over Daily numbers start + 7(g-1) to start + 7g - 1
export const gwRange = (start, g) => [start + 7 * (g - 1), start + 7 * g - 1];
export const currentGw = (start, today = dayNow()) => Math.floor((today - start) / 7) + 1;
export const nextMonday = (today = dayNow()) => weekStartN(today) + 7;

/**
 * Score every fixture and build the table.
 * fixtures: [{ gw, home, away }], scores: [{ player, n, p }]
 */
export function scoreSeason(fixtures, scores, start, today = dayNow()) {
  const cur = currentGw(start, today);
  const byPlayer = new Map();
  for (const s of scores) {
    if (!byPlayer.has(s.player)) byPlayer.set(s.player, new Map());
    byPlayer.get(s.player).set(s.n, s.p);
  }
  const total = (id, g) => {
    const m = byPlayer.get(id); if (!m) return 0;
    const [a, b] = gwRange(start, g); let t = 0;
    for (let n = a; n <= b; n++) t += m.get(n) || 0;
    return t;
  };
  const rows = new Map();
  const row = id => { if (!rows.has(id)) rows.set(id, { id, p: 0, w: 0, d: 0, l: 0, f: 0, a: 0, pts: 0, form: [] }); return rows.get(id); };
  const out = fixtures.map(fx => {
    const started = fx.gw <= cur, done = fx.gw < cur;
    const hs = started ? total(fx.home, fx.gw) : null;
    const as = started && fx.away ? total(fx.away, fx.gw) : null;
    row(fx.home); if (fx.away) row(fx.away);
    if (done && fx.away) {
      const H = row(fx.home), A = row(fx.away);
      H.p++; A.p++; H.f += hs; H.a += as; A.f += as; A.a += hs;
      if (hs > as) { H.w++; A.l++; H.pts += 3; H.form.push('W'); A.form.push('L'); }
      else if (hs < as) { A.w++; H.l++; A.pts += 3; A.form.push('W'); H.form.push('L'); }
      else { H.d++; A.d++; H.pts++; A.pts++; H.form.push('D'); A.form.push('D'); }
    }
    return { gw: fx.gw, h: fx.home, a: fx.away, hs, as, live: started && !done, done };
  });
  const table = [...rows.values()]
    .map(r => ({ ...r, form: r.form.slice(-5).reverse() }))
    .sort((x, y) => y.pts - x.pts || y.f - x.f || y.w - x.w || x.id.localeCompare(y.id));
  return { gw: cur, fixtures: out, table };
}
