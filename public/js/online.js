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

// ---------- your nickname ----------
export async function createMe(nick, club) {
  const r = await api('POST', '/api/me', { action: 'create', nick, club });
  save({ ...r.me, code: r.code });
  return r;
}
export async function restoreMe(code) {
  const r = await api('POST', '/api/me', { action: 'restore', code });
  save({ ...r.me, code: r.code });
  return r;
}
export async function updateMe(fields) {
  const r = await api('POST', '/api/me', { action: 'update', ...fields });
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
export const createLeague = name => api('POST', '/api/leagues', { action: 'create', name });
export const joinLeague = code => api('POST', '/api/leagues', { action: 'join', code });
export const leaveLeague = code => api('POST', '/api/leagues', { action: 'leave', code });
export const renameLeague = (code, name) => api('POST', '/api/leagues', { action: 'rename', code, name });
export const removeMember = (code, player) => api('POST', '/api/leagues', { action: 'remove', code, player });
export const report = (kind, target) => api('POST', '/api/report', { kind, target });

// ---------- scores and challenges ----------
export const postDaily = (n, p) => api('POST', '/api/scores', { n, p });
export const createChallenge = c => api('POST', '/api/challenges', { action: 'create', ...c }).then(r => r.id);
export const postResult = (id, r) => api('POST', '/api/challenges', { action: 'result', id, r });

// League codes: TF-K7Q2M. People may type them in lower case, with spaces, or without the TF-.
export function cleanCode(s) {
  const c = String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^TF/, '');
  return /^[2-9A-HJKMNP-Z]{5}$/.test(c) ? `TF-${c}` : null;
}
