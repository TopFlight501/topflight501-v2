// Runs the site on your own computer, including the /api functions, without Cloudflare's tools.
// The database is a local SQLite file (D1 is SQLite underneath).
//   node tools/dev-server.mjs            → http://localhost:8788
// Env: PORT, DB_FILE (default .dev/db.sqlite), ADMIN_KEY (default dev-admin-key-123)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = Number(process.env.PORT) || 8788;
const DB_FILE = process.env.DB_FILE || path.join(ROOT, '.dev', 'db.sqlite');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const sqlite = new DatabaseSync(DB_FILE);

// ---- a small D1 lookalike ----
class Stmt {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...a) { return new Stmt(this.sql, a); }
  async first() { return sqlite.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  async run() { const r = sqlite.prepare(this.sql).run(...this.args); return { meta: { changes: r.changes } }; }
}
const D1 = {
  prepare: sql => new Stmt(sql),
  async batch(list) {
    sqlite.exec('BEGIN');
    try { const out = []; for (const s of list) out.push(await s.run()); sqlite.exec('COMMIT'); return out; }
    catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  },
};
const kv = new Map();
const KV = { async get(k, t) { const v = kv.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, async put(k, v) { kv.set(k, v); } };
const env = { DB: D1, SCORES: KV, ADMIN_KEY: process.env.ADMIN_KEY || 'dev-admin-key-123' };

// Testing only: POST /__dev/clock {"days": 3} moves this server's clock forward, to play out gameweeks quickly
let shift = 0;
const realNow = Date.now.bind(Date);
Date.now = () => realNow() + shift;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff': 'font/woff', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ics': 'text/calendar' };
const redirects = fs.readFileSync(path.join(ROOT, 'public', '_redirects'), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.trim().split(/\s+/));

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/__dev/clock') {
      const chunks = []; for await (const c of req) chunks.push(c);
      const b = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
      if (b.reset) shift = 0; else shift += (Number(b.days) || 0) * 864e5;
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ now: new Date(Date.now()).toISOString() }));
    }
    const m = url.pathname.match(/^\/api\/([a-z]+)$/);
    if (m) {
      const file = path.join(ROOT, 'functions', 'api', m[1] + '.js');
      if (!fs.existsSync(file)) { res.writeHead(404); return res.end('no such function'); }
      const mod = await import(pathToFileURL(file).href);
      const fn = mod['onRequest' + req.method[0] + req.method.slice(1).toLowerCase()] || mod.onRequest;
      if (!fn) { res.writeHead(405); return res.end(); }
      const chunks = []; for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      request.cf = { country: 'IE' };
      const r = await fn({ request, env });
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    for (const [from, to, code] of redirects) {
      const re = new RegExp('^' + from.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
      const hit = url.pathname.match(re);
      if (hit) { res.writeHead(Number(code) || 302, { location: to.replace(/:(\w+)/g, (_, k) => hit.groups[k]) }); return res.end(); }
    }
    let p = path.join(ROOT, 'public', decodeURIComponent(url.pathname));
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!p.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(p).pipe(res);
  } catch (e) {
    console.error(e); res.writeHead(500); res.end(String(e));
  }
}).listen(PORT, () => console.log(`Top Flight 501 running at http://localhost:${PORT} (database: ${path.relative(ROOT, DB_FILE)})`));
