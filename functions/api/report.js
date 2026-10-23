// Report a nickname or league name that got past the filter. Reports show on the admin page.
import { json, fail, handle, db, who, body, cleanLeague } from '../../lib/server.js';

export const onRequestPost = handle(async ({ request, env }) => {
  const DB = await db(env);
  const me = await who(DB, request);
  const b = await body(request);
  let target = null;
  if (b.kind === 'player' && /^[0-9a-f]{16}$/.test(String(b.target))) {
    const p = await DB.prepare('SELECT id FROM players WHERE id = ?').bind(b.target).first();
    target = p && p.id;
  }
  if (b.kind === 'league') {
    const c = cleanLeague(b.target);
    const l = c && await DB.prepare('SELECT code FROM leagues WHERE code = ?').bind(c).first();
    target = l && l.code;
  }
  if (!target || target === me.id) return fail('Couldn’t send that report.');
  await DB.prepare('INSERT OR IGNORE INTO reports (kind, target, by, at) VALUES (?, ?, ?, ?)').bind(b.kind, target, me.id, Date.now()).run();
  return json({ reported: true });
});
