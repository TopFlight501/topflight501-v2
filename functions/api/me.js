// Your nickname: create one, get it back on another phone with the recovery code, change it, or delete it.
import { json, fail, handle, db, who, body, sha, newId, newRecovery, cleanRecovery, cleanClub, deletePlayer, showLeague, dayNow } from '../../lib/server.js';
import { checkName, nameKey } from '../../lib/names.js';

const pub = p => ({ id: p.id, nick: p.nick, club: p.club || '' });

async function myLeagues(DB, id) {
  const r = await DB.prepare(`SELECT l.code, l.name, l.owner, (SELECT COUNT(*) FROM members x WHERE x.league = l.id) AS n
    FROM members m JOIN leagues l ON l.id = m.league WHERE m.player = ? ORDER BY m.joined`).bind(id).all();
  return (r.results || []).map(l => ({ code: showLeague(l.code), name: l.name, members: l.n, mine: l.owner === id }));
}

export const onRequestGet = handle(async ({ request, env }) => {
  const DB = await db(env);
  const me = await who(DB, request);
  return json({ me: pub(me), leagues: await myLeagues(DB, me.id), day: dayNow() });
});

export const onRequestPost = handle(async ({ request, env }) => {
  const DB = await db(env);
  const b = await body(request);

  if (b.action === 'create') {
    const c = checkName(b.nick, 'nick');
    if (!c.ok) return fail(c.msg, 400, c.why);
    const code = newRecovery();
    const p = { id: newId(), nick: c.name, club: cleanClub(b.club) };
    const now = Date.now();
    try {
      await DB.prepare('INSERT INTO players (id, nick, nick_key, club, secret, created, seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(p.id, p.nick, nameKey(p.nick), p.club, await sha(cleanRecovery(code)), now, now).run();
    } catch (e) {
      if (/UNIQUE/i.test(String(e && e.message))) return fail('That nickname’s taken. Try another one.', 409, 'taken');
      throw e;
    }
    return json({ me: pub(p), code, leagues: [] });
  }

  if (b.action === 'restore') {
    const key = cleanRecovery(b.code);
    const p = key.length === 12 ? await DB.prepare('SELECT id, nick, club FROM players WHERE secret = ?').bind(await sha(key)).first() : null;
    if (!p) return fail('That code doesn’t match a nickname. Check it and try again.', 404, 'nocode');
    await DB.prepare('UPDATE players SET seen = ? WHERE id = ?').bind(Date.now(), p.id).run();
    return json({ me: pub(p), code: key.replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3'), leagues: await myLeagues(DB, p.id) });
  }

  if (b.action === 'update') {
    const me = await who(DB, request);
    let nick = me.nick, club = me.club;
    if (b.nick !== undefined) {
      const c = checkName(b.nick, 'nick');
      if (!c.ok) return fail(c.msg, 400, c.why);
      nick = c.name;
    }
    if (b.club !== undefined) club = cleanClub(b.club);
    try {
      await DB.prepare('UPDATE players SET nick = ?, nick_key = ?, club = ? WHERE id = ?').bind(nick, nameKey(nick), club, me.id).run();
    } catch (e) {
      if (/UNIQUE/i.test(String(e && e.message))) return fail('That nickname’s taken. Try another one.', 409, 'taken');
      throw e;
    }
    return json({ me: pub({ id: me.id, nick, club }) });
  }

  if (b.action === 'delete') {
    const me = await who(DB, request);
    await deletePlayer(DB, me.id);
    return json({ deleted: true });
  }

  return fail('Unknown request.');
});
