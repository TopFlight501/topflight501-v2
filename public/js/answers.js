// Answer checking with spelling tolerance.

export const CATEGORIES = {
  scorer:    { label: 'Scorer',          short: 'Scorer',    points: 60, icon: '⚽' },
  scoreline: { label: 'Exact Scoreline', short: 'Scoreline', points: 50, icon: '🔢' },
  assist:    { label: 'Assist Provider', short: 'Assist',    points: 40, icon: '🅰️' },
  lineup:    { label: 'Lineup Player',   short: 'Lineup',    points: 30, icon: '👕' },
  booked:    { label: 'Booked Player',   short: 'Booked',    points: 25, redPoints: 50, icon: '🟨' },
};
export const MANAGER_BONUS = 20;

export function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o').replace(/æ/gi, 'ae').replace(/ß/g, 'ss').replace(/ł/gi, 'l').replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function tolerance(len) {
  if (len <= 4) return 0;
  if (len <= 6) return 1;
  if (len <= 10) return 2;
  return 3;
}

const PARTICLES = new Set(['de', 'da', 'do', 'dos', 'van', 'von', 'der', 'den', 'la', 'le', 'el', 'di', 'mac', 'bin', 'ter']);

// All the ways someone might reasonably type a player's name.
export function nameKeys(full, web) {
  const keys = new Set();
  const f = norm(full), w = norm(web);
  if (f) keys.add(f);
  if (w) keys.add(w);
  const ft = f.split(' ').filter(Boolean);
  if (ft.length > 1) {
    keys.add(ft[ft.length - 1]);                       // surname
    keys.add(ft[0] + ' ' + ft[ft.length - 1]);          // first + last
    // compound surnames: "van Dijk", "De Bruyne", "Alexander-Arnold"
    for (let i = 1; i < ft.length - 1; i++) {
      if (PARTICLES.has(ft[i])) keys.add(ft.slice(i).join(' '));
    }
    if (ft.length >= 3) keys.add(ft.slice(-2).join(' '));
  }
  const wt = w.split(' ').filter(Boolean);
  if (wt.length > 1) keys.add(wt[wt.length - 1]);
  // never accept tiny keys on their own
  return [...keys].filter(k => k.replace(/ /g, '').length >= 3);
}

// How well does the guess match this player? Returns a distance (lower is better) or Infinity.
export function nameDistance(guess, player) {
  const g = norm(guess);
  if (g.replace(/ /g, '').length < 3) return Infinity;
  let best = Infinity;
  for (const k of nameKeys(player.full, player.web)) {
    const d = lev(g, k);
    if (d <= tolerance(Math.max(k.length, g.length)) && d < best) best = d;
  }
  return best;
}

export function bestPlayer(guess, players) {
  let best = null, bestD = Infinity;
  for (const p of players) {
    const d = nameDistance(guess, p);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

function webUsable(p) {
  return p.web && !p.web.includes('.');
}

// "Rodri (Rodrigo Hernández)" when the known-as name isn't part of the full name
export function displayName(p) {
  const f = norm(p.full), w = norm(p.web);
  if (!webUsable(p) || f.includes(w)) return p.full;
  return `${p.web} (${p.full})`;
}

export function shortName(p) {
  const f = norm(p.full), w = norm(p.web);
  if (!webUsable(p)) return p.full;
  // long legal names ("Bernardo Mota Veiga de Carvalho e Silva") -> the name everyone uses
  if (f.includes(w) && f.split(' ').length <= 3) return p.full;
  return p.web;
}

/**
 * Check one dart.
 * claimed: Set of keys already used by this player on this match, e.g. "scorer:1234", "scoreline".
 * Returns { correct, points, message, key }
 */
export function checkDart(match, category, answer, claimed) {
  const cat = CATEGORIES[category];
  if (!cat) return { correct: false, points: 0, message: 'Pick a category first.' };

  if (category === 'scoreline') {
    const [h, a] = answer;
    if (h === '' || a === '' || h == null || a == null) return { correct: false, points: 0, message: 'Enter both scores.', invalid: true };
    if (claimed.has('scoreline')) return { correct: false, points: 0, message: 'You already hit the scoreline on this match.', invalid: true };
    const ok = Number(h) === match.score[0] && Number(a) === match.score[1];
    return ok
      ? { correct: true, points: cat.points, key: 'scoreline', message: `Spot on, it finished ${match.score[0]}-${match.score[1]}.` }
      : { correct: false, points: 0, message: `Not the scoreline.` };
  }

  const guess = String(answer || '').trim();
  if (norm(guess).replace(/ /g, '').length < 3) return { correct: false, points: 0, message: 'Type at least 3 letters.', invalid: true };

  const pools = {
    scorer: match.players.filter(p => p.goals > 0),
    assist: match.players.filter(p => p.assists > 0),
    lineup: match.players,
    booked: match.players.filter(p => p.card > 0),
  };
  const hit = bestPlayer(guess, pools[category]);
  if (!hit) {
    return { correct: false, points: 0, message: missMessage(category) };
  }
  const key = `${category}:${hit.id}`;
  if (claimed.has(key)) {
    return { correct: false, points: 0, invalid: true, message: `You've already claimed ${shortName(hit)} for that.` };
  }
  let points = cat.points, extra = '';
  if (category === 'booked') {
    if (hit.card === 2) { points = cat.redPoints; extra = ' 🟥 Red card!'; }
    else extra = ' 🟨';
  }
  if (category === 'scorer' && hit.goals > 1) extra = ` (scored ${hit.goals})`;
  if (category === 'assist' && hit.assists > 1) extra = ` (${hit.assists} assists)`;
  if (category === 'lineup') extra = hit.started === false ? ' (off the bench)' : '';
  return { correct: true, points, key, player: hit, message: `${shortName(hit)}${extra}` };
}

function missMessage(category) {
  return {
    scorer: 'Not a scorer in this match.',
    assist: 'No assist from them in this match.',
    lineup: 'Didn’t play in this match.',
    booked: 'Not booked in this match.',
  }[category];
}

export function checkManager(match, guess) {
  const g = norm(guess);
  if (g.replace(/ /g, '').length < 3) return null;
  for (const m of match.managers) {
    if (!m) continue;
    // joint caretakers are stored as "A / B"
    for (const name of m.split(' / ')) {
      const p = { full: name, web: '' };
      if (nameDistance(guess, p) !== Infinity) return m;
    }
  }
  return null;
}
