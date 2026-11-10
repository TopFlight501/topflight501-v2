// Nicknames and online leagues: talks to /api and remembers this phone's nickname.
// Only the nickname, colour and recovery code are kept on the phone (localStorage 'tf501:me').

const KEY = 'tf501:me';

export function me() {
  try { const m = JSON.parse(localStorage.getItem(KEY) || 'null'); return m && m.code && m.nick ? m : null; } catch { return null; }
}
function save(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* ignore */ } return m; }
export function forget() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

class ApiError extends Error {
  constructor(msg, why, status) { super(msg); this.why = why; this.status = status; }
}

async function api(method, path, body) {
  const m = me();
  let r;
  try {
    r = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json', ...(m ? { 'x-tf-key': m.code } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('No connection. Check your signal and try again.', 'offline', 0);
  }
  let j = {};
  try { j = await r.json(); } catch { /* ignore */ }
  if (!r.ok) {
    // the nickname was deleted (from another phone, or after 12 months unused)
    if (r.status === 401 && j.why === 'auth' && m) forget();
    throw new ApiError(j.error || 'Something went wrong. Try again in a minute.', j.why || 'server', r.status);
  }
  return j;
}

// ---------- bot check (Cloudflare Turnstile) ----------
// Only used when making a nickname, changing it, or creating a league. Usually invisible:
// a small box only appears if Cloudflare wants a tap. Does nothing until it's switched on in Cloudflare.
let siteKey = null, scriptLoad = null;
async function getSiteKey() {
  if (siteKey === null) {
    try { const r = await fetch('/api/human'); siteKey = r.ok ? ((await r.json()).key || '') : ''; } catch { siteKey = ''; }
  }
  return siteKey;
}
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptLoad) {
    scriptLoad = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.onload = ok; s.onerror = () => { scriptLoad = null; no(); };
      document.head.appendChild(s);
    });
  }
  return scriptLoad;
}
async function humanToken() {
  const key = await getSiteKey();
  if (!key) return undefined;
  try { await loadScript(); } catch { throw new ApiError('No connection. Check your signal and try again.', 'offline', 0); }
  const box = document.createElement('div');
  box.className = 'human-check';
  box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2000;';
  document.body.appendChild(box);
  let id = null;
  try {
    return await new Promise((ok, no) => {
      const stop = setTimeout(() => no(new ApiError('Couldn’t check you’re not a robot. Try again.', 'human', 0)), 60000);
      id = window.turnstile.render(box, {
        sitekey: key, appearance: 'interaction-only', theme: 'auto',
        callback: t => { clearTimeout(stop); ok(t); },
        'error-callback': () => { clearTimeout(stop); no(new ApiError('Couldn’t check you’re not a robot. Try again.', 'human', 0)); },
      });
    });
  } finally {
    try { if (id !== null) window.turnstile.remove(id); } catch { /* ignore */ }
    box.remove();
  }
}

// ---------- your nickname ----------
export async function createMe(nick, club) {
  const r = await api('POST', '/api/me', { action: 'create', nick, club, ts: await humanToken() });
  save({ ...r.me, code: r.code });
  return r;
}
export async function restoreMe(code) {
  const r = await api('POST', '/api/me', { action: 'restore', code });
  save({ ...r.me, code: r.code });
  return r;
}
export async function updateMe(fields) {
  const changingNick = fields.nick !== undefined && me() && fields.nick.trim() !== me().nick;
  const r = await api('POST', '/api/me', { action: 'update', ...fields, ...(changingNick ? { ts: await humanToken() } : {}) });
  save({ ...me(), ...r.me });
  return r.me;
}
export async function deleteMe() {
  if (!me()) return;
  await api('POST', '/api/me', { action: 'delete' });
  forget();
}
// your leagues (also refreshes nickname and colour, in case they changed on another phone)
export async function refresh() {
  const r = await api('GET', '/api/me');
  save({ ...me(), ...r.me });
  return r;
}

// ---------- leagues ----------
export const league = code => api('GET', '/api/leagues?code=' + encodeURIComponent(code));
export const createLeague = async (name, opts = {}) => api('POST', '/api/leagues', { action: 'create', name, ...opts, ts: await humanToken() });
export const kickOff = code => api('POST', '/api/leagues', { action: 'kickoff', code });
export const nextSeason = (code, format, weeks) => api('POST', '/api/leagues', { action: 'next-season', code, format, weeks });
export const clubs = range => api('GET', '/api/clubs?range=' + range);
export const clubFans = (club, range) => api('GET', '/api/clubs?range=' + range + '&club=' + encodeURIComponent(club));
export const joinLeague = code => api('POST', '/api/leagues', { action: 'join', code });
export const leaveLeague = code => api('POST', '/api/leagues', { action: 'leave', code });
export const renameLeague = (code, name) => api('POST', '/api/leagues', { action: 'rename', code, name });
export const removeMember = (code, player) => api('POST', '/api/leagues', { action: 'remove', code, player });
export const report = (kind, target) => api('POST', '/api/report', { kind, target });

// ---------- scores and challenges ----------
export const postDaily = (n, p, club) => api('POST', '/api/scores', { n, p, ...(club ? { club } : {}) });
export const createChallenge = c => api('POST', '/api/challenges', { action: 'create', ...c }).then(r => r.id);
export const postResult = (id, r) => api('POST', '/api/challenges', { action: 'result', id, r });

// ---------- your progress, saved to your nickname ----------
export const getProgress = () => api('GET', '/api/progress').then(r => r.data);
export const saveProgress = data => api('POST', '/api/progress', { data });

// League codes: TF-K7Q2M. People may type them in lower case, with spaces, or without the TF-.
export function cleanCode(s) {
  const c = String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^TF/, '');
  return /^[2-9A-HJKMNP-Z]{5}$/.test(c) ? `TF-${c}` : null;
}
