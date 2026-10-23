// End-to-end tests for seasons, fixtures and club features. Needs a FRESH local server (it moves the clock):
//   rm -f .dev/season.sqlite && DB_FILE=.dev/season.sqlite PORT=8793 node tools/dev-server.mjs
//   BASE=http://localhost:8793 node tools/test_seasons_api.mjs
const BASE = process.env.BASE || 'http://localhost:8793';
let fails = 0;
const ok = (c, what) => { console.log((c ? 'ok   ' : 'FAIL ') + what); if (!c) fails++; };
async function call(method, path, body, key) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(key ? { 'x-tf-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  try { return { status: r.status, ...JSON.parse(text) }; } catch { return { status: r.status, text, type: r.headers.get('content-type') }; }
}
const clock = days => call('POST', '/__dev/clock', { days });
const post = (path, b, k) => call('POST', path, b, k);
const get = (path, k) => call('GET', path, null, k);

await call('POST', '/__dev/clock', { reset: true });
const clubs = ['Chelsea', 'Arsenal', 'Chelsea', 'Liverpool', 'Chelsea'];
const P = [];
for (let i = 0; i < 5; i++) P.push(await post('/api/me', { action: 'create', nick: `Tester${i}x`, club: clubs[i] }));
const [A, B, C, D, E] = P;
const key = p => p.code, id = p => p.me.id;

// ---------- a half season with 5 players (odd: one bye each week) ----------
let lg = await post('/api/leagues', { action: 'create', name: 'Season Lads', format: 'half' }, key(A));
ok(lg.format === 'half' && lg.status === 'signup' && lg.start > lg.today, 'half season created, signing up until next Monday');
for (const p of [B, C, D, E]) await post('/api/leagues', { action: 'join', code: lg.code }, key(p));
let r = await post('/api/leagues', { action: 'kickoff', code: lg.code }, key(B));
ok(r.status === 403, 'only the owner can kick off');
lg = await post('/api/leagues', { action: 'kickoff', code: lg.code }, key(A));
ok(lg.status === 'live' && lg.gw === 1 && lg.gws === 5, `kicked off: gameweek 1 of 5 (${lg.gw} of ${lg.gws})`);
ok(lg.fixtures.length === 15 && lg.fixtures.filter(f => !f.a).length === 5, '10 games and 5 byes');
ok(lg.table.length === 5 && lg.table.every(t => t.pts === 0), 'table starts at zero');

// play the season: each day, each player scores (index+1)*10, so E beats everyone and A loses everything
const daysLeftInWeek = 7 - ((lg.today - lg.start) % 7);
async function playDay() { for (let i = 0; i < 5; i++) await post('/api/scores', { n: (await get('/api/me', key(P[i]))).day, p: (i + 1) * 10 }, key(P[i])); }
for (let d = 0; d < daysLeftInWeek; d++) { await playDay(); await clock(1); }
lg = await get('/api/leagues?code=' + lg.code, key(A));
ok(lg.gw === 2, 'moved into gameweek 2');
const played = lg.table.reduce((s, t) => s + t.p, 0);
ok(played === 4, 'gameweek 1: two games counted in the table (4 player-games)');
const wins = lg.table.reduce((s, t) => s + t.w, 0), pts = lg.table.reduce((s, t) => s + t.pts, 0);
ok(wins === 2 && pts === 6, 'two winners, 3 points each');
const gw1 = lg.fixtures.filter(f => f.gw === 1 && f.a);
ok(gw1.every(f => f.done && f.hs > 0 && f.as > 0), 'gameweek 1 fixtures finished with scores');
ok(lg.fixtures.filter(f => f.gw === 2).every(f => f.live), 'gameweek 2 is live');

for (let w = 0; w < 4; w++) for (let d = 0; d < 7; d++) { await playDay(); await clock(1); }
lg = await get('/api/leagues?code=' + lg.code, key(A));
ok(lg.status === 'done', 'season finished after gameweek 5');
const top = lg.table[0];
ok(top.id === id(E) && top.pts === 12 && top.p === 4, `E won every game: 4 played, 12 points (${top.pts})`);
ok(lg.table[4].id === id(A) && lg.table[4].pts === 0, 'A bottom on 0 points');
ok(lg.champs.length === 1 && lg.champs[0].nick === 'Tester4x', 'champion recorded');
lg = await post('/api/leagues', { action: 'next-season', code: lg.code, format: 'full' }, key(A));
ok(lg.season === 2 && lg.status === 'signup' && lg.format === 'full' && lg.champs.length === 1, 'season 2 signing up, full season, past champion kept');

// ---------- a sprint that kicks off by itself on the Monday ----------
let sp = await post('/api/leagues', { action: 'create', name: 'Quick Sprint', format: 'sprint', weeks: 4 }, key(B));
ok(sp.weeks === 4 && sp.status === 'signup', 'sprint of 4 gameweeks created');
await post('/api/leagues', { action: 'join', code: sp.code }, key(C));
await clock(sp.start - sp.today);
sp = await get('/api/leagues?code=' + sp.code, key(B));
ok(sp.status === 'live' && sp.gw === 1 && sp.gws === 4, 'kicked off by itself on Monday');
ok(sp.fixtures.filter(f => f.gw === 1).length === 1, 'one fixture a week with two players');

// a lonely league waits another week
let lone = await post('/api/leagues', { action: 'create', name: 'Lonely Lads', format: 'full' }, key(D));
await clock(lone.start - lone.today);
lone = await get('/api/leagues?code=' + lone.code, key(D));
ok(lone.status === 'signup' && lone.start > lone.today, 'with one player, kick-off moves to next Monday');
r = await post('/api/leagues', { action: 'kickoff', code: lone.code }, key(D));
ok(r.status === 400 && r.why === 'alone', 'can’t kick off alone');

// ---------- club-only open league ----------
let cl = await post('/api/leagues', { action: 'create', name: 'Blues Only', format: 'open', club: 'Chelsea' }, key(A));
ok(cl.club === 'Chelsea', 'club-only league created');
await post('/api/leagues', { action: 'join', code: cl.code }, key(C));
const today = (await get('/api/me', key(A))).day;
await post('/api/scores', { n: today, p: 155, club: 'Chelsea' }, key(A));
await post('/api/scores', { n: today, p: 90 }, key(A));
r = await post('/api/scores', { n: today, p: 10, club: 'Barcelona' }, key(A));
ok(r.status === 400, 'unknown club refused');
cl = await get('/api/leagues?code=' + cl.code, key(A));
ok(cl.daily.find(d => d.id === id(A)).today === 155, 'club league counts the club Daily, not the normal one');

// ---------- supporters ----------
let sup = await get('/api/clubs?range=all', key(A));
const chelsea = sup.clubs.find(c => c.club === 'Chelsea');
ok(chelsea && chelsea.fans === 3 && chelsea.players === 3, 'Chelsea ranked with 3 fans');
ok(sup.waiting.some(c => c.club === 'Arsenal'), 'clubs with fewer than 3 fans are waiting');
const fans = await get('/api/clubs?range=all&club=Chelsea', key(A));
ok(fans.rows.length === 3 && fans.rows[0].nick === 'Tester4x' && fans.rows[0].rank === 1, 'Chelsea fans table, best fan first');
r = await get('/api/clubs?club=Barcelona');
ok(r.status === 400, 'unknown club refused');

// ---------- calendar reminder ----------
r = await get('/api/remind?code=' + sp.code);
ok(/text\/calendar/.test(r.type) && /RRULE:FREQ=WEEKLY;COUNT=3/.test(r.text) && /DTSTART;TZID=Europe\/Dublin:\d{8}T190000/.test(r.text) && /Quick Sprint: gameweek closes tonight/.test(r.text), 'weekly calendar reminder for the season');
r = await get('/api/remind?code=' + cl.code);
ok(r.status === 404, 'no gameweek reminder for an open league');

// ---------- leaving mid-season and deleting ----------
await post('/api/me', { action: 'delete' }, key(C));
sp = await get('/api/leagues?code=' + sp.code, key(B));
ok(sp.status === 'live' && sp.fixtures.length === 4, 'fixtures stay when an opponent deletes their nickname');

await clock(0); await call('POST', '/__dev/clock', { reset: true });
console.log(fails ? `\n${fails} FAILED` : '\nAll season API tests passed');
process.exitCode = fails ? 1 : 0;
