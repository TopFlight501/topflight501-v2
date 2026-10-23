// Challenge links between players with nicknames, so results count towards head-to-head records.
// The link itself still carries the game and the matches, so it works for anyone, nickname or not.
import { json, fail, handle, db, who, body, randCode, beats, VS_GAMES } from '../../lib/server.js';

const MATCHES = /^\d{4}-\d{1,3}(\.\d{4}-\d{1,3}){0,79}$/;

export const onRequestGet = handle(async ({ request, env }) => {
  const DB = await db(env);
  const id = String(new URL(request.url).searchParams.get('id') || '');
  const c = /^[2-9A-Z]{10}$/.test(id) ? await DB.prepare(`SELECT c.g, c.s, c.e, c.r, p.nick, p.club FROM challenges c JOIN players p ON p.id = c.player WHERE c.id = ?`).bind(id).first() : null;
  if (!c) return fail('Challenge not found.', 404, 'nochal');
  return json({ nick: c.nick, club: c.club || '', g: c.g, s: c.s, e: !!c.e, r: c.r });
});

export const onRequestPost = handle(async ({ request, env }) => {
  const DB = await db(env);
  const me = await who(DB, request);
  const b = await body(request);

  if (b.action === 'create') {
    const g = String(b.g), s = Number(b.s) || 501, r = Number(b.r), m = String(b.m || '');
    if (!VS_GAMES.includes(g) || ![101, 301, 501].includes(s) || !Number.isInteger(r) || r < 0 || r > 100000 || !MATCHES.test(m)) return fail('That challenge doesn’t look right.');
    const id = randCode(10);
    await DB.prepare('INSERT INTO challenges (id, player, g, s, e, r, m, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, me.id, g, s, b.e ? 1 : 0, r, m, Date.now()).run();
    return json({ id });
  }

  if (b.action === 'result') {
    const id = String(b.id || ''), r = Number(b.r);
    const c = /^[2-9A-Z]{10}$/.test(id) ? await DB.prepare(`SELECT c.*, p.nick, p.club FROM challenges c JOIN players p ON p.id = c.player WHERE c.id = ?`).bind(id).first() : null;
    if (!c) return fail('Challenge not found.', 404, 'nochal');
    if (c.player === me.id) return json({ own: true });   // replaying your own link doesn't count
    if (!Number.isInteger(r) || r < 0 || r > 100000) return fail('That score doesn’t look right.');
    // only the first go at a challenge counts
    await DB.prepare('INSERT OR IGNORE INTO results (chal, player, r, at) VALUES (?, ?, ?, ?)').bind(id, me.id, r, Date.now()).run();
    const saved = await DB.prepare('SELECT r FROM results WHERE chal = ? AND player = ?').bind(id, me.id).first();
    return json({ them: { id: c.player, nick: c.nick, club: c.club || '' }, theirs: c.r, mine: saved.r, outcome: beats(c.g, saved.r, c.r), first: saved.r === r });
  }

  return fail('Unknown request.');
});
