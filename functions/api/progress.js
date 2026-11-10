// Your progress, saved to your nickname so a new phone gets it back: Daily Match scores by day (the streak),
// achievements, personal bests, stats and career points. Game data only, nothing about the person.
import { json, fail, handle, db, who, body } from '../../lib/server.js';

const MAX_BYTES = 60000;     // about four years of daily play
const MAX_POINTS = 5000000;

export const onRequestGet = handle(async ({ request, env }) => {
  const DB = await db(env);
  const me = await who(DB, request);
  const row = await DB.prepare('SELECT data FROM progress WHERE player = ?').bind(me.id).first();
  let data = null;
  try { data = row ? JSON.parse(row.data) : null; } catch { data = null; }
  return json({ data });
});

export const onRequestPost = handle(async ({ request, env }) => {
  const DB = await db(env);
  const me = await who(DB, request);
  const b = await body(request);
  const d = b.data;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return fail('Nothing to save.');
  const text = JSON.stringify(d);
  if (text.length > MAX_BYTES) return fail('Too much to save.', 413, 'big');
  const pts = Math.min(MAX_POINTS, Math.max(0, Math.round(Number(d.stats && d.stats.pts) || 0)));
  await DB.prepare(`INSERT INTO progress (player, data, pts, at) VALUES (?, ?, ?, ?)
    ON CONFLICT (player) DO UPDATE SET data = excluded.data, pts = excluded.pts, at = excluded.at`).bind(me.id, text, pts, Date.now()).run();
  return json({ saved: true });
});
