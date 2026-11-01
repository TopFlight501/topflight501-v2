// Tells the site whether the Turnstile bot check is switched on, and its public site key.
// Empty key = switched off (TURNSTILE_SITEKEY not set in Cloudflare yet).
export async function onRequestGet({ env }) {
  const key = (env.TURNSTILE_SECRET && env.TURNSTILE_SITEKEY) || '';
  return new Response(JSON.stringify({ key }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  });
}
