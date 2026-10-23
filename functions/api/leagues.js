// Online leagues: create, join with a code, leave, rename, remove a player, kick off a season, and view the tables.
// Formats: open (a running Daily points table) or a season (full home and away, half, or a sprint of set gameweeks)
// where each gameweek is a head-to-head fixture decided by Daily Match points. Challenge-link results are shown too.
import { json, fail, handle, db, who, body, randCode, newId, cleanLeague, showLeague, cleanClubDaily, dayNow, dayOf, weekStartN, beats } from '../../lib/server.js';
import { FORMATS, SPRINT_WEEKS, SEASON_MAX, drawFixtures, shuffled, scoreSeason, nextMonday, currentGw } from '../../lib/season.js';
import { checkName } from '../../lib/names.js';

const MAX_MEMBERS = 50, MAX_LEAGUES = 20, MAX_OWNED = 10;
const isSeason = lg => FORMATS[lg.format] && FORMATS[lg.format].season;
const cap = lg => (isSeason(lg) ? SEASON_MAX : MAX_MEMBERS);

async function findLeague(DB, code) {
  const c = cleanLeague(code);
  return c ? DB.prepare('SELECT * FROM leagues WHERE code = ?').bind(c).first() : null;
}
const notFound = () => fail('No league has that code. Check it and try again.', 404, 'noleague');

// Daily scores for these players from Daily n onwards (the club's own Daily for club-only leagues)
async function scoresFor(DB, lg, ids, since) {
  if (!ids.length) return [];
  const marks = ids.map(() => '?').join(',');
  const q = lg.club
    ? DB.prepare(`SELECT player, n, p FROM cscores WHERE club = ? AND n >= ? AND player IN (${marks})`).bind(lg.club, since, ...ids)
    : DB.prepare(`SELECT player, n, p FROM dscores WHERE n >= ? AND player IN (${marks})`).bind(since, ...ids);
  return (await q.all()).results || [];
}

// Seasons move on by themselves: kick off on the start date, finish after the last gameweek.
async function advance(DB, lg) {
  if (!isSeason(lg)) return lg;
  const today = dayNow();
  if (lg.status === 'signup' && today >= lg.start_n) {
    const ids = ((await DB.prepare('SELECT player FROM members WHERE league = ? ORDER BY joined LIMIT ?').bind(lg.id, SEASON_MAX).all()).results || []).map(r => r.player);
    if (ids.length < 2) {
      // not enough players yet: try again next Monday
      const start = nextMonday(today);
      await DB.prepare('UPDATE leagues SET start_n = ? WHERE id = ?').bind(start, lg.id).run();
      return { ...lg, start_n: start };
    }
    await kickOff(DB, lg, ids, weekStartN(today) <= lg.start_n ? lg.start_n : weekStartN(today));
    return DB.prepare('SELECT * FROM leagues WHERE id = ?').bind(lg.id).first();
  }
  if (lg.status === 'live') {
    const last = (await DB.prepare('SELECT MAX(gw) AS g FROM fixtures WHERE league = ? AND season = ?').bind(lg.id, lg.season).first()).g || 0;
    if (currentGw(lg.start_n, today) > last) {
      const v = await seasonView(DB, lg, today);
      const top = v.table[0];
      const champs = JSON.parse(lg.champs || '[]');
      if (top && !champs.some(c => c.season === lg.season)) {
        const p = await DB.prepare('SELECT nick FROM players WHERE id = ?').bind(top.id).first();
        champs.push({ season: lg.season, id: top.id, nick: p ? p.nick : 'Old player', pts: top.pts });
      }
      await DB.prepare("UPDATE leagues SET status = 'done', champs = ? WHERE id = ?").bind(JSON.stringify(champs), lg.id).run();
      return { ...lg, status: 'done', champs: JSON.stringify(champs) };
    }
  }
  return lg;
}

async function kickOff(DB, lg, ids, start) {
  const rounds = drawFixtures(shuffled(ids), lg.format, lg.weeks);
  const stmts = [DB.prepare('DELETE FROM fixtures WHERE league = ? AND season = ?').bind(lg.id, lg.season)];
  rounds.forEach((games, r) => games.forEach(([h, a]) => {
    stmts.push(DB.prepare('INSERT INTO fixtures (league, season, gw, home, away) VALUES (?, ?, ?, ?, ?)').bind(lg.id, lg.season, r + 1, h, a));
  }));
  stmts.push(DB.prepare("UPDATE leagues SET status = 'live', start_n = ? WHERE id = ?").bind(start, lg.id));
  await DB.batch(stmts);
}

async function seasonView(DB, lg, today = dayNow()) {
  const fx = (await DB.prepare('SELECT gw, home, away FROM fixtures WHERE league = ? AND season = ? ORDER BY gw').bind(lg.id, lg.season).all()).results || [];
  const ids = [...new Set(fx.flatMap(f => [f.home, f.away]).filter(Boolean))];
  const scores = await scoresFor(DB, lg, ids, lg.start_n);
  return { ...scoreSeason(fx, scores, lg.start_n, today), gws: fx.reduce((m, f) => Math.max(m, f.gw), 0), players: ids };
}

async function view(DB, lg, meId) {
  lg = await advance(DB, lg);
  const ms = (await DB.prepare(`SELECT p.id, p.nick, p.club, m.joined FROM members m JOIN players p ON p.id = m.player
    WHERE m.league = ? ORDER BY m.joined`).bind(lg.id).all()).results || [];
  const ids = ms.map(m => m.id);
  const marks = ids.map(() => '?').join(',');
  const today = dayNow(), week = weekStartN(today), since = dayOf(lg.created);

  const out = {
    code: showLeague(lg.code), name: lg.name, owner: lg.owner, mine: lg.owner === meId, me: meId,
    format: lg.format || 'open', weeks: lg.weeks || 0, club: lg.club || '', season: lg.season || 1,
    status: lg.status || 'open', start: lg.start_n || 0, today, week, cap: cap(lg),
    champs: JSON.parse(lg.champs || '[]'),
    members: ms.map(m => ({ id: m.id, nick: m.nick, club: m.club || '' })),
  };

  if (isSeason(lg)) {
    if (lg.status === 'live' || lg.status === 'done') {
      const sv = await seasonView(DB, lg, today);
      Object.assign(out, { gw: sv.gw, gws: sv.gws, table: sv.table, fixtures: sv.fixtures, inSeason: sv.players });
    }
  } else {
    // open table: Daily points this week and since the league started
    const scores = await scoresFor(DB, lg, ids, since);
    out.daily = ms.map(m => {
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
  }

  // challenge links played between members
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
  out.h2h = Object.values(rec);
  out.results = games.slice(0, 20).map(g => ({ a: g.a, b: g.b, g: g.g, s: g.s, ar: g.ar, br: g.br, at: g.at }));
  return out;
}

export const onRequestGet = handle(async ({ request, env }) => {
  const DB = await db(env);
  const lg = await findLeague(DB, new URL(request.url).searchParams.get('code'));
  if (!lg) return notFound();
  const me = await who(DB, request, false);
  const member = me && await DB.prepare('SELECT 1 FROM members WHERE league = ? AND player = ?').bind(lg.id, me.id).first();
  if (!member) {
    const n = await DB.prepare('SELECT COUNT(*) AS n FROM members WHERE league = ?').bind(lg.id).first();
    return json({ preview: true, code: showLeague(lg.code), name: lg.name, members: n.n, format: lg.format || 'open', weeks: lg.weeks || 0, club: lg.club || '', status: lg.status || 'open', start: lg.start_n || 0 });
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
    const format = FORMATS[b.format] ? b.format : 'open';
    const weeks = format === 'sprint' ? (SPRINT_WEEKS.includes(Number(b.weeks)) ? Number(b.weeks) : 6) : 0;
    const club = cleanClubDaily(b.club);
    const counts = await DB.prepare(`SELECT (SELECT COUNT(*) FROM leagues WHERE owner = ?) AS owned, (SELECT COUNT(*) FROM members WHERE player = ?) AS joined`).bind(me.id, me.id).first();
    if (counts.owned >= MAX_OWNED) return fail(`You can run up to ${MAX_OWNED} leagues.`, 400, 'limit');
    if (counts.joined >= MAX_LEAGUES) return fail(`You can be in up to ${MAX_LEAGUES} leagues. Leave one first.`, 400, 'limit');
    const season = FORMATS[format].season;
    const lg = { id: newId(), name: c.name, format, weeks, club, season: 1, status: season ? 'signup' : 'open', start_n: season ? nextMonday() : 0, champs: '[]', owner: me.id, created: now };
    for (let i = 0; i < 5; i++) {
      lg.code = randCode(5);
      try {
        await DB.batch([
          DB.prepare('INSERT INTO leagues (id, code, name, owner, created, format, weeks, club, season, start_n, status, champs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(lg.id, lg.code, lg.name, me.id, now, format, weeks, club, 1, lg.start_n, lg.status, '[]'),
          DB.prepare('INSERT INTO members (league, player, joined) VALUES (?, ?, ?)').bind(lg.id, me.id, now),
        ]);
        return json(await view(DB, lg, me.id));
      } catch (e) { if (!/UNIQUE/i.test(String(e && e.message))) throw e; }
    }
    return fail('Couldn’t make a league code. Try again.', 500);
  }

  let lg = await findLeague(DB, b.code);
  if (!lg) return notFound();

  if (b.action === 'join') {
    const already = await DB.prepare('SELECT 1 FROM members WHERE league = ? AND player = ?').bind(lg.id, me.id).first();
    if (!already) {
      const c = await DB.prepare(`SELECT (SELECT COUNT(*) FROM members WHERE league = ?) AS n, (SELECT COUNT(*) FROM members WHERE player = ?) AS joined`).bind(lg.id, me.id).first();
      if (c.n >= cap(lg)) return fail(isSeason(lg) ? `That league is full. Seasons have up to ${SEASON_MAX} players, like the Premier League.` : `That league is full (${MAX_MEMBERS} players).`, 400, 'full');
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
      else await DB.batch([DB.prepare('DELETE FROM fixtures WHERE league = ?').bind(lg.id), DB.prepare('DELETE FROM leagues WHERE id = ?').bind(lg.id)]);
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

  // seasons: kick off now (this week is gameweek 1), or start the next season
  if (b.action === 'kickoff') {
    if (!isSeason(lg) || lg.status !== 'signup') return fail('This league has already kicked off.');
    const ids = ((await DB.prepare('SELECT player FROM members WHERE league = ? ORDER BY joined LIMIT ?').bind(lg.id, SEASON_MAX).all()).results || []).map(r => r.player);
    if (ids.length < 2) return fail('You need at least one mate in the league to kick off. Send them the invite first.', 400, 'alone');
    await kickOff(DB, lg, ids, weekStartN());
    lg = await DB.prepare('SELECT * FROM leagues WHERE id = ?').bind(lg.id).first();
    return json(await view(DB, lg, me.id));
  }
  if (b.action === 'next-season') {
    if (!isSeason(lg) || lg.status !== 'done') return fail('The season hasn’t finished yet.');
    const format = FORMATS[b.format] && FORMATS[b.format].season ? b.format : lg.format;
    const weeks = format === 'sprint' ? (SPRINT_WEEKS.includes(Number(b.weeks)) ? Number(b.weeks) : (lg.weeks || 6)) : 0;
    await DB.prepare("UPDATE leagues SET season = season + 1, status = 'signup', start_n = ?, format = ?, weeks = ? WHERE id = ?").bind(nextMonday(), format, weeks, lg.id).run();
    lg = await DB.prepare('SELECT * FROM leagues WHERE id = ?').bind(lg.id).first();
    return json(await view(DB, lg, me.id));
  }

  return fail('Unknown request.');
});
