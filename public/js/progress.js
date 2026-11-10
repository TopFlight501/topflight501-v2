// Your progress: career points and rank, stats, streak freezes, and saving it all to your nickname.
// Everything lives on this device (localStorage). With a leagues nickname it's also saved online,
// so a new phone gets the streak, achievements and stats back.
import { dailyKey } from './data.js?v=77';

const get = (k, d) => { try { const v = localStorage.getItem('tf501:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const set = (k, v) => { try { localStorage.setItem('tf501:' + k, JSON.stringify(v)); } catch { /* ignore */ } };

export const CATS = ['scorer', 'assist', 'scoreline', 'lineup', 'booked', 'manager'];

// ---------- ranks: a football career, climbed with career points ----------
export const RANKS = [
  { at: 0, icon: '🥾', name: 'Sunday League' },
  { at: 300, icon: '📝', name: 'Trialist' },
  { at: 1000, icon: '🎒', name: 'Youth Team' },
  { at: 2500, icon: '🪑', name: 'Bench Warmer' },
  { at: 5000, icon: '👕', name: 'Squad Player' },
  { at: 9000, icon: '⚽', name: 'First Teamer' },
  { at: 15000, icon: '🎖️', name: 'Captain' },
  { at: 24000, icon: '🌟', name: 'Fan Favourite' },
  { at: 36000, icon: '👑', name: 'Club Legend' },
  { at: 55000, icon: '🏛️', name: 'Hall of Famer' },
  { at: 80000, icon: '🏆', name: 'Invincible' },
];
export function rankOf(pts) {
  pts = Math.max(0, Number(pts) || 0);
  let i = 0;
  while (i + 1 < RANKS.length && pts >= RANKS[i + 1].at) i += 1;
  const cur = RANKS[i], next = RANKS[i + 1] || null;
  return { i, ...cur, pts, next, toGo: next ? next.at - pts : 0, pct: next ? Math.round((pts - cur.at) / (next.at - cur.at) * 100) : 100 };
}

// ---------- stats ----------
// { pts: career points, games: finished games, cats: { scorer: [hits, thrown], ... }, since: 'YYYY-MM-DD' }
const blank = () => ({ pts: 0, games: 0, cats: {}, since: dailyKey() });
export function stats() {
  let s = get('stats', null);
  if (!s || typeof s !== 'object') {
    // first time: start career points from the Daily Match scores already on this device
    s = blank();
    const log = get('dailyLog', {});
    s.pts = Object.values(log).reduce((t, v) => t + (Number(v) || 0), 0);
    s.games = (get('history', []) || []).length;
    set('stats', s);
  }
  if (!s.cats || typeof s.cats !== 'object') s.cats = {};
  return s;
}
// one dart thrown in a solo game or a Daily Match
export function recordDart(cat, correct, points) {
  const s = stats();
  if (CATS.includes(cat)) {
    const c = s.cats[cat] || [0, 0];
    c[1] += 1; if (correct) c[0] += 1;
    s.cats[cat] = c;
  }
  if (correct && points > 0) s.pts += Math.round(points);
  set('stats', s);
  return s;
}
export function recordGameDone() { const s = stats(); s.games += 1; set('stats', s); return s; }
export const careerPoints = () => stats().pts;

// ---------- streak freezes ----------
// { have: 0-2, used: { 'YYYY-MM-DD': 1 }, earned: 'YYYY-MM-DD' of the last one earned }
export const MAX_FREEZES = 2, FREEZE_EVERY = 7;
export function freezes() {
  const f = get('fz', null) || {};
  return { have: Math.min(MAX_FREEZES, Math.max(0, Number(f.have) || 0)), used: f.used && typeof f.used === 'object' ? f.used : {}, earned: f.earned || '' };
}
const back = d => { const x = new Date(d); x.setDate(x.getDate() - 1); return x; };

// Days in a row with a Daily Match played. A frozen day keeps the run going but doesn't add to it.
export function streakFrom(log, used = {}, today = new Date()) {
  let d = new Date(today), n = 0;
  if (log[dailyKey(d)] === undefined) d = back(d);   // today not played yet: count up to yesterday
  for (;;) {
    const k = dailyKey(d);
    if (log[k] !== undefined) n += 1;
    else if (!used[k]) break;
    d = back(d);
  }
  return n;
}
export function bestStreak(log, used = {}) {
  const days = [...new Set([...Object.keys(log), ...Object.keys(used)])].filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  let best = 0, run = 0, prev = null;
  for (const k of days) {
    const d = new Date(k + 'T12:00:00');
    const joined = prev && dailyKey(back(d)) === prev;
    if (!joined) run = 0;
    if (log[k] !== undefined) run += 1;
    best = Math.max(best, run); prev = k;
  }
  return best;
}
// Missed a day or two? Spend freezes to cover them, if there's a streak behind the gap.
// Returns the number of freezes just used (0 if none).
export function settleFreezes(today = new Date()) {
  const log = get('dailyLog', {}), f = freezes();
  if (!f.have || log[dailyKey(today)] !== undefined) return 0;
  const gaps = []; let d = back(today);
  while (log[dailyKey(d)] === undefined && !f.used[dailyKey(d)] && gaps.length <= f.have) { gaps.push(dailyKey(d)); d = back(d); }
  if (!gaps.length || gaps.length > f.have) return 0;
  if (streakFrom(log, f.used, d) < 1 || (log[dailyKey(d)] === undefined && !f.used[dailyKey(d)])) return 0;
  for (const k of gaps) f.used[k] = 1;
  f.have -= gaps.length;
  set('fz', f);
  return gaps.length;
}
// After a Daily: every 7 days in a row earns a freeze (you can hold two). Returns true if one was just earned.
export function earnFreeze(streak, today = new Date()) {
  const f = freezes(), k = dailyKey(today);
  if (!streak || streak % FREEZE_EVERY || f.earned === k || f.have >= MAX_FREEZES) return false;
  f.have += 1; f.earned = k; set('fz', f);
  return true;
}

// ---------- Daily Match numbers for the stats page ----------
export const BANDS = [[0, 0, '0'], [5, 60, '5–60'], [65, 120, '65–120'], [125, 180, '125–180'], [185, 240, '185–240'], [245, 300, '245–300'], [305, 360, '305+']];
export function dailyNumbers(log) {
  const vals = Object.values(log).map(Number).filter(v => Number.isFinite(v));
  const bands = BANDS.map(([lo, hi]) => vals.filter(v => v >= lo && v <= hi).length);
  return { played: vals.length, avg: vals.length ? Math.round(vals.reduce((t, v) => t + v, 0) / vals.length) : 0, best: vals.length ? Math.max(...vals) : 0, bands };
}

// ---------- saving to your nickname ----------
const BEST_KEYS = ['best:501', 'best:301', 'best:101', 'best:clock', 'best:sudden'];
export function snapshot() {
  const bests = {};
  for (const k of BEST_KEYS) { const v = get(k, null); if (v) bests[k] = v; }
  return { v: 1, log: get('dailyLog', {}), ach: get('ach', {}), bests, stats: stats(), fz: freezes() };
}
// Join another device's progress with this one: nothing is lost, the better of each is kept.
// Returns true if anything on this device changed.
export function merge(other) {
  if (!other || typeof other !== 'object') return false;
  const before = JSON.stringify(snapshot());
  const log = get('dailyLog', {});
  for (const [day, pts] of Object.entries(other.log || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || typeof pts !== 'number' || pts < 0 || pts > 360) continue;
    if (log[day] === undefined || pts > log[day]) log[day] = pts;
  }
  set('dailyLog', log);
  const ach = get('ach', {});
  for (const [k, v] of Object.entries(other.ach || {})) if (!ach[k] && typeof v === 'string') ach[k] = v.slice(0, 10);
  set('ach', ach);
  for (const k of BEST_KEYS) {
    const v = (other.bests || {})[k], cur = get(k, null);
    if (!v || typeof v !== 'object') continue;
    const better = k === 'best:sudden' ? Number(v.points) > 0 && (!cur || v.points > cur.points) : Number(v.darts) > 0 && (!cur || v.darts < cur.darts);
    if (better) set(k, v);
  }
  const s = stats(), o = other.stats || {};
  s.pts = Math.max(s.pts, Math.min(5e6, Math.round(Number(o.pts) || 0)));
  s.games = Math.max(s.games, Math.round(Number(o.games) || 0));
  if (typeof o.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.since) && o.since < s.since) s.since = o.since;
  for (const c of CATS) {
    const a = s.cats[c] || [0, 0], b = Array.isArray((o.cats || {})[c]) ? o.cats[c].map(x => Math.max(0, Math.round(Number(x) || 0))) : [0, 0];
    if (b[1] > a[1]) s.cats[c] = [Math.min(b[0], b[1]), b[1]];
  }
  set('stats', s);
  const f = freezes(), of = other.fz || {};
  let usedMore = false;
  for (const k of Object.keys(of.used || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && !f.used[k]) { f.used[k] = 1; usedMore = true; }
  // the device that earned or spent a freeze most recently knows how many are left
  if (typeof of.earned === 'string' && of.earned > f.earned) { f.have = Math.min(MAX_FREEZES, Math.max(0, Number(of.have) || 0)); f.earned = of.earned; }
  else if (usedMore) f.have = Math.min(f.have, Math.max(0, Number(of.have) || 0));
  set('fz', f);
  return JSON.stringify(snapshot()) !== before;
}
