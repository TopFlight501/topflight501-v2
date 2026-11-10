// Tests for ranks, streaks, streak freezes, stats and joining progress from two phones.
//   node tools/test_progress.mjs
const mem = {}; globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
const P = await import('../public/js/progress.js'); const { dailyKey } = await import('../public/js/data.js?v=77');
import assert from 'node:assert';
const day = n => { const d = new Date(2026, 10, 10); d.setDate(d.getDate() - n); return d; };
const k = n => dailyKey(day(n)); const today = day(0);
const setLog = o => localStorage.setItem('tf501:dailyLog', JSON.stringify(o));
const setFz = o => localStorage.setItem('tf501:fz', JSON.stringify(o));
// ranks
assert.equal(P.rankOf(0).name, 'Sunday League'); assert.equal(P.rankOf(299).i, 0); assert.equal(P.rankOf(300).name, 'Trialist');
assert.equal(P.rankOf(1e9).next, null); assert.equal(P.rankOf(650).pct, 50);
// streaks
let log = { [k(1)]: 100, [k(2)]: 0, [k(3)]: 50 };
assert.equal(P.streakFrom(log, {}, today), 3);                       // a score of 0 still counts
log[k(0)] = 10; assert.equal(P.streakFrom(log, {}, today), 4);
assert.equal(P.streakFrom({ [k(0)]: 5, [k(2)]: 5 }, {}, today), 1);
assert.equal(P.streakFrom({ [k(0)]: 5, [k(2)]: 5 }, { [k(1)]: 1 }, today), 2);   // frozen day bridges, doesn't count
assert.equal(P.bestStreak({ [k(9)]: 1, [k(8)]: 1, [k(7)]: 1, [k(5)]: 1, [k(4)]: 1 }), 3);
assert.equal(P.bestStreak({ [k(9)]: 1, [k(8)]: 1, [k(7)]: 1, [k(5)]: 1, [k(4)]: 1 }, { [k(6)]: 1 }), 5);
// freezes: missed yesterday, one in hand
setLog({ [k(2)]: 50, [k(3)]: 50 }); setFz({ have: 1 });
assert.equal(P.settleFreezes(today), 1); assert.equal(P.freezes().have, 0); assert.ok(P.freezes().used[k(1)]);
assert.equal(P.streakFrom(JSON.parse(mem['tf501:dailyLog']), P.freezes().used, today), 2);
assert.equal(P.settleFreezes(today), 0);                             // running again does nothing
// missed two days with one freeze: streak is gone, freeze kept
setLog({ [k(3)]: 50 }); setFz({ have: 1 }); assert.equal(P.settleFreezes(today), 0); assert.equal(P.freezes().have, 1);
// missed two with two
setFz({ have: 2 }); assert.equal(P.settleFreezes(today), 2); assert.equal(P.freezes().have, 0);
// no streak behind the gap: nothing used
setLog({}); setFz({ have: 2 }); assert.equal(P.settleFreezes(today), 0);
// already played today: nothing used
setLog({ [k(0)]: 50, [k(2)]: 50 }); setFz({ have: 2 }); assert.equal(P.settleFreezes(today), 0);
// earning
setFz({ have: 0 }); assert.equal(P.earnFreeze(6, today), false); assert.equal(P.earnFreeze(7, today), true); assert.equal(P.earnFreeze(7, today), false);
assert.equal(P.freezes().have, 1); assert.equal(P.earnFreeze(14, day(-7)), true); assert.equal(P.earnFreeze(21, day(-14)), false); assert.equal(P.freezes().have, 2);
// stats: starts from Daily scores already on the phone
delete mem['tf501:stats']; setLog({ [k(1)]: 100, [k(2)]: 60 }); assert.equal(P.stats().pts, 160);
P.recordDart('scorer', true, 60); P.recordDart('scorer', false, 0); P.recordDart('lineup', true, 20);
assert.deepEqual(P.stats().cats.scorer, [1, 2]); assert.equal(P.careerPoints(), 240);
const d = P.dailyNumbers({ a: 0, b: 60, c: 65, d: 360 }); assert.deepEqual(d.bands, [1, 1, 1, 0, 0, 0, 1]); assert.equal(d.avg, 121); assert.equal(d.best, 360);
// merge with another phone
const other = { log: { [k(5)]: 300, [k(1)]: 20, bad: 5 }, ach: { first: '2026-10-05' }, bests: { 'best:301': { darts: 9, matches: 3 } }, stats: { pts: 9000, games: 40, cats: { scorer: [50, 80] }, since: '2026-10-02' }, fz: { have: 1, used: {}, earned: '2030-01-01' } };
assert.equal(P.merge(other), true);
const L = JSON.parse(mem['tf501:dailyLog']); assert.equal(L[k(5)], 300); assert.equal(L[k(1)], 100); assert.equal(L.bad, undefined);
assert.equal(P.careerPoints(), 9000); assert.deepEqual(P.stats().cats.scorer, [50, 80]); assert.deepEqual(P.stats().cats.lineup, [1, 1]);
assert.equal(JSON.parse(mem['tf501:best:301']).darts, 9); assert.equal(P.freezes().have, 1);
assert.equal(P.merge(P.snapshot()), false); assert.equal(P.merge(null), false);
console.log('progress tests passed');
