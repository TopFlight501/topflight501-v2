// Online leagues: create, join with a code, leave, rename, remove a player, and view the tables.
// Each league has a Daily table (Daily Match points, this week and all time) and a Head-to-head table
// (results of challenge links between members).
import { json, fail, handle, db, who, body, randCode, newId, cleanLeague, showLeague, dayNow, dayOf, weekStartN, beats } from '../../lib/server.js';
import { checkName } from '../../lib/names.js';

const MAX_MEMBERS = 50, MAX_LEAGUES = 20, MAX_OWNED = 10;

async function findLeague(DB, code) {
  const c = cleanLeague(code);
  return c ? DB.prepare('SELECT * FROM leagues WHERE code = ?').bind(c).first() : null;
}
const notFound = () => fail('No league has that code. Check it and try again.', 404, 'noleague');

async function view(DB, lg, meId) {
  const ms = (await DB.prepare(`SELECT p.id, p.nick, p.club, m.joined FROM members m JOIN players p ON p.id = m.player
    WHERE m.league = ? ORDER BY m.joined`).bind(lg.id).all()).results || [];
  const ids = ms.map(m => m.id);
  const marks = ids.map(() => '?').join(',');
  const today = dayNow(), week = weekStartN(today), since = dayOf(lg.created);

  // Daily table
  const scores = ids.length ? (await DB.prepare(`SELECT player, n, p FROM dscores WHERE n >= ? AND player IN (${marks})`).bind(since, ...ids).all()).results || [] : [];
  const daily = ms.map(m => {
    const mine = scores.filter(s => s.player === m.id);
    const wk = mine.filter(s => s.n >= week);
    const t = mine.find(s => s.n === today);
    return {
      id: m.id,
      week: { pts: wk.reduce((a, s) => a + s.p, 0), played: wk.length },
      all: { pts: mine.reduce((a, s) => a + s.p, 0), played: mine.length, best: mine.reduce((a, s) => Math.max(a, s.p), 0) },
      today: t ? t.p : null,
    };
  });

  // Head-to-head: challenge links played between two members
  const games = ids.length ? (await DB.prepare(`SELECT c.player AS a, c.g, c.s, c.r AS ar, r.player AS b, r.r AS br, r.at
    FROM results r JOIN challenges c ON c.id = r.chal
    WHERE c.player IN (${marks}) AND r.player IN (${marks}) ORDER BY r.at DESC LIMIT 500`).bind(...ids, ...ids).all()).results || [] : [];
  const rec = Object.fromEntries(ids.map(id => [id, { id, p: 0, w: 0, d: 0, l: 0 }]));
  for (const g of games) {
    const o = beats(g.g, g.ar, g.br);
    rec[g.a].p++; rec[g.b].p++;
    if (o === 0) { rec[g.a].d++; rec[g.b].d++; }
    else if (o > 0) { rec[g.a].w++; rec[g.b].l++; }
    else { rec[g.b].w++; rec[g.a].l++; }
  }

  return {
    code: showLeague(lg.code), name: lg.name, owner: lg.owner, mine: lg.owner === meId, me: meId,
    today, week,
    members: ms.map(m => ({ id: m.id, nick: m.nick, club: m.club || '' })),
    daily,
    h2h: Object.values(rec),
    results: games.slice(0, 20).map(g => ({ a: g.a, b: g.b, g: g.g, s: g.s, ar: g.ar, br: g.br, at: g.at })),
  };
}

export const onRequestGet = handle(async ({ request, env }) => {
  const DB = await db(env);
  const lg = await findLeague(DB, new URL(request.url).searchParams.get('code'));
  if (!lg) return notFound();
  const me = await who(DB, request, false);
  const member = me && await DB.prepare('SELECT 1 FROM members WHERE league = ? AND player = ?').bind(lg.id, me.id).first();
  if (!member) {
    const n = await DB.prepare('SELECT COUNT(*) AS n FROM members WHERE league = ?').bind(lg.id).first();
    return json({ preview: true, code: showLeague(lg.code), name: lg.name, members: n.n });
  }
  return json(await view(DB, lg, me.id));
});

export const onRequestPost = handle(async ({ request, env }) => {
  const DB = await db(env);
  const me = await who(DB, request);
  const b = await body(request);
  const now = Date.now();

  if (b.action === 'create') {
    const c = checkName(b.name, 'league');
    if (!c.ok) return fail(c.msg, 400, c.why);
    const counts = await DB.prepare(`SELECT (SELECT COUNT(*) FROM leagues WHERE owner = ?) AS owned, (SELECT COUNT(*) FROM members WHERE player = ?) AS joined`).bind(me.id, me.id).first();
    if (counts.owned >= MAX_OWNED) return fail(`You can run up to ${MAX_OWNED} leagues.`, 400, 'limit');
    if (counts.joined >= MAX_LEAGUES) return fail(`You can be in up to ${MAX_LEAGUES} leagues. Leave one first.`, 400, 'limit');
    const lg = { id: newId(), name: c.name };
    for (let i = 0; i < 5; i++) {
      lg.code = randCode(5);
      try {
        await DB.batch([
          DB.prepare('INSERT INTO leagues (id, code, name, owner, created) VALUES (?, ?, ?, ?, ?)').bind(lg.id, lg.code, lg.name, me.id, now),
          DB.prepare('INSERT INTO members (league, player, joined) VALUES (?, ?, ?)').bind(lg.id, me.id, now),
        ]);
        return json(await view(DB, { ...lg, owner: me.id, created: now }, me.id));
      } catch (e) { if (!/UNIQUE/i.test(String(e && e.message))) throw e; }
    }
    return fail('Couldn’t make a league code. Try again.', 500);
  }

  const lg = await findLeague(DB, b.code);
  if (!lg) return notFound();

  if (b.action === 'join') {
    const already = await DB.prepare('SELECT 1 FROM members WHERE league = ? AND player = ?').bind(lg.id, me.id).first();
    if (!already) {
      const c = await DB.prepare(`SELECT (SELECT COUNT(*) FROM members WHERE league = ?) AS n, (SELECT COUNT(*) FROM members WHERE player = ?) AS joined`).bind(lg.id, me.id).first();
      if (c.n >= MAX_MEMBERS) return fail(`That league is full (${MAX_MEMBERS} players).`, 400, 'full');
      if (c.joined >= MAX_LEAGUES) return fail(`You can be in up to ${MAX_LEAGUES} leagues. Leave one first.`, 400, 'limit');
      await DB.prepare('INSERT OR IGNORE INTO members (league, player, joined) VALUES (?, ?, ?)').bind(lg.id, me.id, now).run();
    }
    return json(await view(DB, lg, me.id));
  }

  const member = await DB.prepare('SELECT 1 FROM members WHERE league = ? AND player = ?').bind(lg.id, me.id).first();
  if (!member) return fail('You’re not in that league.', 403, 'notmember');

  if (b.action === 'leave') {
    await DB.prepare('DELETE FROM members WHERE league = ? AND player = ?').bind(lg.id, me.id).run();
    if (lg.owner === me.id) {
      const next = await DB.prepare('SELECT player FROM members WHERE league = ? ORDER BY joined LIMIT 1').bind(lg.id).first();
      if (next) await DB.prepare('UPDATE leagues SET owner = ? WHERE id = ?').bind(next.player, lg.id).run();
      else await DB.prepare('DELETE FROM leagues WHERE id = ?').bind(lg.id).run();
    }
    return json({ left: true });
  }

  if (lg.owner !== me.id) return fail('Only the person who runs the league can do that.', 403, 'notowner');

  if (b.action === 'rename') {
    const c = checkName(b.name, 'league');
    if (!c.ok) return fail(c.msg, 400, c.why);
    await DB.prepare('UPDATE leagues SET name = ? WHERE id = ?').bind(c.name, lg.id).run();
    return json(await view(DB, { ...lg, name: c.name }, me.id));
  }

  if (b.action === 'remove') {
    if (b.player === me.id) return fail('Use “Leave league” to leave your own league.');
    await DB.prepare('DELETE FROM members WHERE league = ? AND player = ?').bind(lg.id, String(b.player || '')).run();
    return json(await view(DB, lg, me.id));
  }

  return fail('Unknown request.');
});
