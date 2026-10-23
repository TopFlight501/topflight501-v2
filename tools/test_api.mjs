// End-to-end tests for the online league API. Start the local server first:
//   DB_FILE=.dev/test.sqlite node tools/dev-server.mjs   (in another terminal; delete the file for a clean run)
//   node tools/test_api.mjs
const BASE = process.env.BASE || 'http://localhost:8788';
let fails = 0;
const ok = (cond, what) => { if (!cond) { fails++; console.log('FAIL:', what); } else console.log('ok  ', what); };
async function call(method, path, body, key) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(key ? { 'x-tf-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { ...(await r.json().catch(() => ({}))), status: r.status };
}
const tag = String(Date.now()).slice(-5);

// nicknames
let r = await call('POST', '/api/me', { action: 'create', nick: 'f.u.c.k' });
ok(r.status === 400 && r.why === 'rude', 'rude nickname refused');
r = await call('POST', '/api/me', { action: 'create', nick: 'Sean Murphy' });
ok(r.status === 400 && r.why === 'realname', 'real name refused');
const a = await call('POST', '/api/me', { action: 'create', nick: `Barry_${tag}`, club: 'Chelsea' });
ok(a.status === 200 && /^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(a.code), 'nickname created with recovery code');
r = await call('POST', '/api/me', { action: 'create', nick: `BARRY_${tag.toLowerCase()}` });
ok(r.status === 409, 'same nickname with different spacing/case is taken');
const b = await call('POST', '/api/me', { action: 'create', nick: `TopBins ${tag}`, club: 'Arsenal' });
const c = await call('POST', '/api/me', { action: 'create', nick: `Claret ${tag}`, club: 'Burnley' });
ok(b.status === 200 && c.status === 200, 'two more nicknames created');
r = await call('GET', '/api/me', null, a.code);
ok(r.me && r.me.nick === `Barry_${tag}` && r.me.club === 'Chelsea', 'phone recognised by its code');
r = await call('GET', '/api/me', null, 'AAAA-BBBB-CCCC');
ok(r.status === 401, 'unknown code refused');
r = await call('POST', '/api/me', { action: 'restore', code: a.code.toLowerCase().replace(/-/g, ' ') });
ok(r.me && r.me.id === a.me.id, 'restore works with lower case and spaces');
r = await call('POST', '/api/me', { action: 'update', club: 'Liverpool' }, a.code);
ok(r.me && r.me.club === 'Liverpool', 'club colour changed');
r = await call('POST', '/api/me', { action: 'update', club: 'Not A Club' }, a.code);
ok(r.me && r.me.club === '', 'unknown club falls back to no club');

// leagues
r = await call('POST', '/api/leagues', { action: 'create', name: 'Shite Lads' }, a.code);
ok(r.status === 400 && r.why === 'rude', 'rude league name refused');
const lg = await call('POST', '/api/leagues', { action: 'create', name: `The Local XI ${tag}` }, a.code);
ok(lg.status === 200 && /^TF-[2-9A-Z]{5}$/.test(lg.code) && lg.mine, 'league created with join code');
r = await call('GET', '/api/leagues?code=' + lg.code, null, b.code);
ok(r.preview && r.members === 1, 'non-member sees only a preview');
r = await call('POST', '/api/leagues', { action: 'join', code: lg.code.toLowerCase().replace('-', '') }, b.code);
ok(r.members && r.members.length === 2, 'joined with code typed in lower case without the dash');
r = await call('POST', '/api/leagues', { action: 'join', code: lg.code }, c.code);
ok(r.members && r.members.length === 3, 'third player joined');
r = await call('POST', '/api/leagues', { action: 'join', code: 'TF-ZZZZZ' }, c.code);
ok(r.status === 404, 'wrong code says no league');

// daily scores
const day = (await call('GET', '/api/me', null, a.code)).day;
ok((await call('POST', '/api/scores', { n: day, p: 120 }, a.code)).saved, 'Daily score saved');
ok((await call('POST', '/api/scores', { n: day, p: 300 }, a.code)).saved, 'second score for the same day accepted quietly');
await call('POST', '/api/scores', { n: day, p: 200 }, b.code);
r = await call('POST', '/api/scores', { n: day, p: 123 }, c.code);
ok(r.status === 400, 'impossible score refused');
r = await call('POST', '/api/scores', { n: day - 5, p: 100 }, c.code);
ok(r.status === 400, 'old Daily refused');
let v = await call('GET', '/api/leagues?code=' + lg.code, null, a.code);
const row = id => v.daily.find(d => d.id === id);
ok(row(a.me.id).today === 120 && row(a.me.id).week.pts === 120, 'first score is the one that counts');
ok(row(b.me.id).all.pts === 200 && row(c.me.id).today === null, 'Daily table totals right');

// challenges
const ch = await call('POST', '/api/challenges', { action: 'create', g: 'x01', s: 501, r: 21, m: '2324-15.1718-200' }, a.code);
ok(/^[2-9A-Z]{10}$/.test(ch.id), 'challenge created');
r = await call('GET', '/api/challenges?id=' + ch.id);
ok(r.nick === `Barry_${tag}` && r.club === '' && r.r === 21, 'challenge link shows who sent it');
r = await call('POST', '/api/challenges', { action: 'result', id: ch.id, r: 18 }, b.code);
ok(r.outcome === 1 && r.theirs === 21, 'fewer darts beats the challenge');
r = await call('POST', '/api/challenges', { action: 'result', id: ch.id, r: 30 }, b.code);
ok(r.mine === 18 && r.first === false, 'only the first go counts');
r = await call('POST', '/api/challenges', { action: 'result', id: ch.id, r: 25 }, c.code);
ok(r.outcome === -1, 'more darts loses');
r = await call('POST', '/api/challenges', { action: 'result', id: ch.id, r: 1 }, a.code);
ok(r.own, 'playing your own challenge does not count');
const sd = await call('POST', '/api/challenges', { action: 'create', g: 'sudden', s: 501, r: 140, m: '2324-15' }, c.code);
r = await call('POST', '/api/challenges', { action: 'result', id: sd.id, r: 140 }, a.code);
ok(r.outcome === 0, 'Sudden Death draw');
v = await call('GET', '/api/leagues?code=' + lg.code, null, c.code);
const h = id => v.h2h.find(x => x.id === id);
ok(h(a.me.id).p === 3 && h(a.me.id).w === 1 && h(a.me.id).l === 1 && h(a.me.id).d === 1, 'head-to-head record for the challenger');
ok(h(b.me.id).w === 1 && h(c.me.id).l === 1 && h(c.me.id).d === 1, 'head-to-head records for the others');
ok(v.results.length === 3, 'recent results listed');

// owner tools
r = await call('POST', '/api/leagues', { action: 'rename', code: lg.code, name: 'New name' }, b.code);
ok(r.status === 403, 'only the owner can rename');
r = await call('POST', '/api/leagues', { action: 'rename', code: lg.code, name: `Friday Lads ${tag}` }, a.code);
ok(r.name === `Friday Lads ${tag}`, 'owner renamed the league');
r = await call('POST', '/api/leagues', { action: 'remove', code: lg.code, player: c.me.id }, a.code);
ok(r.members.length === 2, 'owner removed a player');
await call('POST', '/api/leagues', { action: 'join', code: lg.code }, c.code);

// reports and admin
ok((await call('POST', '/api/report', { kind: 'player', target: c.me.id }, b.code)).reported, 'player reported');
ok((await call('POST', '/api/report', { kind: 'league', target: lg.code }, b.code)).reported, 'league reported');
r = await fetch(BASE + '/api/admin', { headers: { 'x-admin-key': 'wrong-key-wrong-key' } });
ok(r.status === 401, 'admin needs the right key');
const adm = await (await fetch(BASE + '/api/admin', { headers: { 'x-admin-key': process.env.ADMIN_KEY || 'dev-admin-key-123' } })).json();
ok(adm.reports.length >= 2 && adm.players.length >= 3, 'admin sees reports and players');

// leaving and deleting
r = await call('POST', '/api/leagues', { action: 'leave', code: lg.code }, a.code);
ok(r.left, 'owner left');
v = await call('GET', '/api/leagues?code=' + lg.code, null, b.code);
ok(v.owner === b.me.id, 'league passed to the longest-standing member');
r = await call('POST', '/api/me', { action: 'delete' }, b.code);
ok(r.deleted, 'account deleted');
r = await call('GET', '/api/me', null, b.code);
ok(r.status === 401, 'deleted account is gone');
v = await call('GET', '/api/leagues?code=' + lg.code, null, c.code);
ok(v.owner === c.me.id && v.members.length === 1 && !v.h2h.find(x => x.id === b.me.id), 'their results and ownership went with them');
r = await call('POST', '/api/me', { action: 'create', nick: `TopBins ${tag}` });
ok(r.status === 200, 'deleted nickname is free again');

console.log(fails ? `\n${fails} FAILED` : '\nAll API tests passed');
process.exitCode = fails ? 1 : 0;
