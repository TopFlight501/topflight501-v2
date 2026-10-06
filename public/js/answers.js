// Answer checking with spelling tolerance.

export const CATEGORIES = {
  scorer:    { label: 'Scorer',          short: 'Scorer',    points: 60, icon: '⚽' },
  scoreline: { label: 'Exact Scoreline', short: 'Scoreline', points: 50, icon: '🔢' },
  assist:    { label: 'Assist Provider', short: 'Assist',    points: 40, icon: '🅰️' },
  lineup:    { label: 'Lineup Player',   short: 'Lineup',    points: 20, icon: '👕' },
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
 * claimed: Map of answer key -> times already claimed by this player on this match, e.g. "scorer:1234" -> 1.
 * A player can be claimed as many times as they did it: two goals means two Scorer darts, two assists means two Assist darts.
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

  let guess = String(answer || '').trim();
  // "Janmaat OG", "Janmaat (o.g.)" or "Janmaat own goal" all mean the same as "Janmaat"
  if (category === 'scorer') guess = guess.replace(/[\s(\[-]*(o\.?\s?g\.?|own[\s-]?goal)[)\]]*\s*$/i, '').trim() || guess;
  if (norm(guess).replace(/ /g, '').length < 3) return { correct: false, points: 0, message: 'Type at least 3 letters.', invalid: true };

  const pools = {
    scorer: match.players.filter(p => p.goals > 0 || p.og > 0),
    assist: match.players.filter(p => p.assists > 0),
    lineup: match.players,
    booked: match.players.filter(p => p.card > 0),
  };
  const hit = bestPlayer(guess, pools[category]);
  if (!hit) {
    return { correct: false, points: 0, message: missMessage(category) };
  }
  const key = `${category}:${hit.id}`;
  const allowed = timesAllowed(category, hit);
  const used = claimed.get(key) || 0;
  if (used >= allowed) {
    const what = category === 'scorer' ? (allowed === 1 ? 'their goal' : `all ${allowed} of their goals`)
      : category === 'assist' ? (allowed === 1 ? 'their assist' : `all ${allowed} of their assists`) : 'that';
    return { correct: false, points: 0, invalid: true, message: `You've already claimed ${shortName(hit)} for ${what}.` };
  }
  // Lineup is for players you haven't already used: no double-dipping on a scorer, assist or booking
  if (category === 'lineup') {
    const used = ['scorer', 'assist', 'booked'].find(c => claimed.has(`${c}:${hit.id}`));
    if (used) return { correct: false, points: 0, invalid: true, dup: true, player: hit, usedAs: used, message: `You’ve already had ${shortName(hit)} as ${{ scorer: 'a scorer', assist: 'an assist', booked: 'a booking' }[used]}. Pick someone else for Lineup.` };
  }
  let points = cat.points, extra = '';
  if (category === 'booked') {
    if (hit.card === 2) { points = cat.redPoints; extra = ' 🟥 Red card!'; }
    else extra = ' 🟨';
  }
  if (category === 'scorer') {
    const n = used + 1;
    // goals first, then own goals
    const isOg = n > hit.goals;
    if (allowed > 1) extra = ` (${isOg ? 'own goal' : 'goal'} ${n} of ${allowed})`;
    else if (isOg) extra = ' (own goal)';
  }
  if (category === 'assist' && allowed > 1) extra = ` (assist ${used + 1} of ${allowed})`;
  if (category === 'lineup') extra = hit.started === false ? ' (off the bench)' : '';
  return { correct: true, points, key, player: hit, message: `${shortName(hit)}${extra}` };
}

// How many times this player can be claimed in this category
export function timesAllowed(category, p) {
  if (category === 'scorer') return (p.goals || 0) + (p.og || 0);
  if (category === 'assist') return p.assists || 0;
  return 1;
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
      // managers are often known by their first name (Pep, Nuno, Unai)
      const first = norm(name).split(' ')[0];
      if (first.length >= 3 && lev(g, first) <= tolerance(first.length)) return m;
    }
  }
  return null;
}
