// Anonymous, cookie-free visit counting with Umami (umami.is).
// No cookies, no personal data, and visitors with "Do Not Track" switched on aren't counted.
// Until UMAMI_WEBSITE_ID is filled in, nothing loads and nothing is sent.

export const UMAMI_WEBSITE_ID = '98dc03c0-56d6-4082-8803-1e23c0328579';

export function initAnalytics() {
  if (!UMAMI_WEBSITE_ID || document.getElementById('umami-script')) return;
  const s = document.createElement('script');
  s.id = 'umami-script';
  s.defer = true;
  s.src = 'https://cloud.umami.is/script.js';
  s.dataset.websiteId = UMAMI_WEBSITE_ID;
  s.dataset.domains = 'topflight501.com,www.topflight501.com';   // ignore test copies and previews
  s.dataset.doNotTrack = 'true';
  document.head.appendChild(s);
}

// Record a game event, e.g. track('Game started', { game: 'Killer', players: 3 })
export function track(name, data) {
  try { if (window.umami && typeof window.umami.track === 'function') window.umami.track(name, data); } catch { /* never break the game */ }
}
