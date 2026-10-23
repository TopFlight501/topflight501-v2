// League Daily scores: a player with a nickname sends their Daily Match score once per day.
// The first score sent for a day is the one that counts.
import { json, fail, handle, db, who, body, dayNow } from '../../lib/server.js';

const MAX = 360;   // six darts × 60

export const onRequestPost = handle(async ({ request, env }) => {
  const DB = await db(env);
  const me = await who(DB, request);
  const b = await body(request);
  const n = Number(b.n), p = Number(b.p), now = dayNow();
  if (!Number.isInteger(n) || n < now - 1 || n > now + 1) return fail('That Daily has closed.', 400, 'day');
  if (!Number.isInteger(p) || p < 0 || p > MAX || p % 5) return fail('That score doesn’t look right.', 400, 'score');
  await DB.prepare('INSERT OR IGNORE INTO dscores (player, n, p, at) VALUES (?, ?, ?, ?)').bind(me.id, n, p, Date.now()).run();
  return json({ saved: true });
});
