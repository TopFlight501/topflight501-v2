// Admin page backend (topflight501.com/admin.html): see reports and the newest names, rename or remove them.
// Protected by the ADMIN_KEY secret set in Cloudflare (Settings → Variables and secrets).
import { json, fail, handle, db, body, cleanLeague, showLeague, deletePlayer } from '../../lib/server.js';
import { nameKey } from '../../lib/names.js';

async function check(request, env) {
  const key = request.headers.get('x-admin-key') || '';
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 12) throw fail('The admin key isn’t set up in Cloudflare yet.', 503, 'nokey');
  // compare in constant time
  const a = new TextEncoder().encode(key), b = new TextEncoder().encode(env.ADMIN_KEY);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] || 0) ^ b[i];
  if (diff) throw fail('Wrong admin key.', 401, 'badkey');
}

export const onRequestGet = handle(async ({ request, env }) => {
  await check(request, env);
  const DB = await db(env);
  const reports = (await DB.prepare(`SELECT r.kind, r.target, COUNT(*) AS n, MAX(r.at) AS at,
      COALESCE(p.nick, l.name) AS name
    FROM reports r LEFT JOIN players p ON r.kind = 'player' AND p.id = r.target LEFT JOIN leagues l ON r.kind = 'league' AND l.code = r.target
    GROUP BY r.kind, r.target ORDER BY n DESC, at DESC LIMIT 100`).all()).results || [];
  const players = (await DB.prepare('SELECT id, nick, club, created FROM players ORDER BY created DESC LIMIT 100').all()).results || [];
  const leagues = (await DB.prepare(`SELECT l.code, l.name, l.created, (SELECT COUNT(*) FROM members m WHERE m.league = l.id) AS members
    FROM leagues l ORDER BY l.created DESC LIMIT 100`).all()).results || [];
  const totals = await DB.prepare(`SELECT (SELECT COUNT(*) FROM players) AS players, (SELECT COUNT(*) FROM leagues) AS leagues,
    (SELECT COUNT(*) FROM results) AS challenges`).first();
  return json({
    totals,
    reports: reports.map(r => ({ ...r, target: r.kind === 'league' ? showLeague(r.target) : r.target })),
    players,
    leagues: leagues.map(l => ({ ...l, code: showLeague(l.code) })),
  });
});

export const onRequestPost = handle(async ({ request, env }) => {
  await check(request, env);
  const DB = await db(env);
  const b = await body(request);
  const id = String(b.id || '');
  const lg = b.code ? cleanLeague(b.code) : null;
  switch (b.action) {
    case 'rename-player': {
      // replaces the name with a neutral one; the player can pick a new nickname themselves
      const nick = `Player ${id.slice(0, 4).toUpperCase()}`;
      await DB.prepare('UPDATE players SET nick = ?, nick_key = ? WHERE id = ?').bind(nick, nameKey(nick + id), id).run();
      await DB.prepare("DELETE FROM reports WHERE kind = 'player' AND target = ?").bind(id).run();
      return json({ done: true, nick });
    }
    case 'remove-player':
      await deletePlayer(DB, id);
      return json({ done: true });
    case 'rename-league': {
      if (!lg) return fail('No league code.');
      await DB.prepare('UPDATE leagues SET name = ? WHERE code = ?').bind(`League ${lg}`, lg).run();
      await DB.prepare("DELETE FROM reports WHERE kind = 'league' AND target = ?").bind(lg).run();
      return json({ done: true });
    }
    case 'remove-league': {
      if (!lg) return fail('No league code.');
      const l = await DB.prepare('SELECT id FROM leagues WHERE code = ?').bind(lg).first();
      if (l) await DB.batch([DB.prepare('DELETE FROM members WHERE league = ?').bind(l.id), DB.prepare('DELETE FROM leagues WHERE id = ?').bind(l.id)]);
      await DB.prepare("DELETE FROM reports WHERE kind = 'league' AND target = ?").bind(lg).run();
      return json({ done: true });
    }
    case 'dismiss':
      await DB.prepare('DELETE FROM reports WHERE kind = ? AND target = ?').bind(String(b.kind), b.kind === 'league' ? lg : id).run();
      return json({ done: true });
  }
  return fail('Unknown request.');
});
