// Tests for the fixture draw and season table. Run:  node tools/test_season.mjs
import { roundRobin, drawFixtures, scoreSeason } from '../lib/season.js';

let fails = 0;
const ok = (c, what) => { if (!c) { fails++; console.log('FAIL:', what); } };
const players = n => Array.from({ length: n }, (_, i) => 'p' + (i + 1));

for (let n = 2; n <= 20; n++) {
  const ids = players(n);
  const full = drawFixtures(ids, 'full'), half = drawFixtures(ids, 'half');
  const R = n % 2 ? n : n - 1;
  ok(half.length === R && full.length === 2 * R, `${n} players: ${R} gameweeks half, ${2 * R} full`);
  for (const [name, rounds] of [['half', half], ['full', full]]) {
    const met = new Map(), home = new Map(), byes = new Map();
    for (const r of rounds) {
      const seen = new Set();
      for (const [a, b] of r) {
        ok(!seen.has(a) && (!b || !seen.has(b)), `${n} ${name}: nobody plays twice in a gameweek`);
        seen.add(a); if (b) seen.add(b);
        if (!b) { byes.set(a, (byes.get(a) || 0) + 1); continue; }
        const k = [a, b].sort().join('-');
        met.set(k, (met.get(k) || 0) + 1);
        home.set(a, (home.get(a) || 0) + 1);
      }
      ok(seen.size === n, `${n} ${name}: everyone has a fixture or a bye each week`);
    }
    const times = name === 'full' ? 2 : 1;
    ok(met.size === n * (n - 1) / 2 && [...met.values()].every(v => v === times), `${n} ${name}: every pair meets ${times}×`);
    if (n % 2) ok(ids.every(id => byes.get(id) === times), `${n} ${name}: one bye each per half`);
    if (name === 'full') {
      ok(ids.every(id => home.get(id) === n - 1), `${n} full: everyone has ${n - 1} home games`);
      // each pair: one home game each
      const hv = new Map();
      for (const r of rounds) for (const [a, b] of r) if (b) hv.set(a + '>' + b, (hv.get(a + '>' + b) || 0) + 1);
      ok([...hv.values()].every(v => v === 1), `${n} full: each pair once at each ground`);
    } else {
      const hs = ids.map(id => home.get(id) || 0);
      ok(Math.max(...hs) - Math.min(...hs) <= 2, `${n} half: home games spread evenly (${Math.min(...hs)}–${Math.max(...hs)})`);
    }
  }
  const sprint = drawFixtures(ids, 'sprint', 6);
  ok(sprint.length === 6, `${n} sprint: 6 gameweeks`);
}
ok(drawFixtures(players(20), 'full').length === 38, '20 players home and away = 38 gameweeks');

// table: two gameweeks, then the third in progress
const fx = [{ gw: 1, home: 'a', away: 'b' }, { gw: 1, home: 'c', away: '' }, { gw: 2, home: 'b', away: 'c' }, { gw: 2, home: 'a', away: '' }, { gw: 3, home: 'c', away: 'a' }, { gw: 3, home: 'b', away: '' }];
const start = 100;
const sc = [
  { player: 'a', n: 100, p: 60 }, { player: 'a', n: 103, p: 40 }, { player: 'b', n: 101, p: 90 },   // gw1: a 100 v b 90
  { player: 'b', n: 107, p: 50 }, { player: 'c', n: 110, p: 50 },                                    // gw2: b 50 v c 50
  { player: 'c', n: 114, p: 200 },                                                                    // gw3 live
];
const s = scoreSeason(fx, sc, start, 115);
const t = Object.fromEntries(s.table.map(r => [r.id, r]));
ok(s.gw === 3, 'current gameweek is 3');
ok(t.a.pts === 3 && t.a.w === 1 && t.a.p === 1, 'a won gameweek 1');
ok(t.b.pts === 1 && t.b.l === 1 && t.b.d === 1 && t.b.f === 140, 'b lost then drew');
ok(t.c.pts === 1 && t.c.p === 1, 'byes don’t count as games');
ok(s.table[0].id === 'a', 'a top of the table');
const live = s.fixtures.find(f => f.gw === 3 && f.a === 'a');
ok(live.live && live.hs === 200 && live.as === 0, 'live gameweek shows running scores');
ok(s.fixtures.find(f => f.gw === 1 && f.a === 'b').done, 'finished gameweek marked done');

console.log(fails ? `${fails} FAILED` : 'All season tests passed');
process.exitCode = fails ? 1 : 0;
