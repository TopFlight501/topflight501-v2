// The Supporters' table: every club ranked by its fans' average Daily Match score,
// and each club's own fans table. A player's fans are the nicknames that picked that club's colours.
import { json, fail, handle, db, who, CLUBS, weekStartN } from '../../lib/server.js';

const MIN_FANS = 3;   // a club needs this many fans playing before it's ranked

export const onRequestGet = handle(async ({ request, env }) => {
  const DB = await db(env);
  const q = new URL(request.url).searchParams;
  const since = q.get('range') === 'all' ? 0 : weekStartN();
  const me = await who(DB, request, false);

  const club = q.get('club');
  if (club) {
    if (!CLUBS.includes(club)) return fail('Unknown club.');
    const rows = (await DB.prepare(`SELECT p.id, p.nick, SUM(s.p) AS pts, COUNT(*) AS played FROM players p JOIN dscores s ON s.player = p.id
      WHERE p.club = ? AND s.n >= ? GROUP BY p.id ORDER BY pts DESC, played ASC, p.nick LIMIT 50`).bind(club, since).all()).results || [];
    const fans = (await DB.prepare('SELECT COUNT(*) AS n FROM players WHERE club = ?').bind(club).first()).n;
    let mine = null;
    if (me && me.club === club && !rows.some(r => r.id === me.id)) {
      const r = await DB.prepare('SELECT SUM(p) AS pts, COUNT(*) AS played FROM dscores WHERE player = ? AND n >= ?').bind(me.id, since).first();
      if (r && r.played) {
        const above = await DB.prepare(`SELECT COUNT(*) AS n FROM (SELECT SUM(s.p) AS pts FROM players p JOIN dscores s ON s.player = p.id
          WHERE p.club = ? AND s.n >= ? GROUP BY p.id) WHERE pts > ?`).bind(club, since, r.pts).first();
        mine = { id: me.id, nick: me.nick, pts: r.pts, played: r.played, rank: above.n + 1 };
      }
    }
    return json({ club, fans, rows: rows.map((r, i) => ({ ...r, rank: i + 1 })), mine, me: me ? me.id : null });
  }

  const fans = Object.fromEntries(((await DB.prepare("SELECT club, COUNT(*) AS n FROM players WHERE club != '' GROUP BY club").all()).results || []).map(r => [r.club, r.n]));
  const played = (await DB.prepare(`SELECT p.club, COUNT(DISTINCT p.id) AS players, COUNT(*) AS plays, SUM(s.p) AS pts FROM players p JOIN dscores s ON s.player = p.id
    WHERE p.club != '' AND s.n >= ? GROUP BY p.club`).bind(since).all()).results || [];
  const clubs = played
    .filter(r => r.players >= MIN_FANS)
    .map(r => ({ club: r.club, fans: fans[r.club] || 0, players: r.players, avg: Math.round((r.pts / r.plays) * 10) / 10 }))
    .sort((a, b) => b.avg - a.avg || b.players - a.players);
  const waiting = Object.keys(fans).filter(c => !clubs.some(x => x.club === c)).map(c => ({ club: c, fans: fans[c] }));
  return json({ clubs, waiting, min: MIN_FANS, myClub: me ? me.club : null });
});
