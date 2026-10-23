// Checks nicknames and league names before they're saved.
// Catches rude words in many languages, disguised spellings (sh1t, f.u.c.k, phuk, shiiit, BigAssKev),
// look-alike letters from other alphabets, emails, phone numbers, links and real names.
// The word lists live in name-lists.js (built by tools/build_names.py).
import LISTS from './name-lists.js';

const SPECIAL = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ð: 'd', ł: 'l', þ: 'th', ı: 'i', ħ: 'h' };
const plain = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[ßæœøđðłþıħ]/g, c => SPECIAL[c]);
const LEET = { 0: 'o', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '€': 'e', '+': 't', '£': 'e' };
const leet = (s, one) => s.replace(/[0-9@$!|€+£]/g, c => (c === '1' ? one : LEET[c] || c));
// sound-alike spellings: phuk = fuck, kunt = cunt, azz = ass, fyck = fick
const phon = s => s.replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/[cq]/g, 'k').replace(/x/g, 'ks').replace(/z/g, 's').replace(/y/g, 'i');
const squash = s => s.replace(/[^a-z]/g, '');
const collapse = s => s.replace(/(.)\1+/g, '$1');
const formA = s => phon(squash(s));

// ---------- prepare the lists once ----------
// Every word is kept in two spellings: "lite" (letters only: f.u.c.k → fuck) and "full" (sound-alike too: phuk → fuk).
// Strong words (fuck, cunt, shit...) are hunted in the full spelling; everything else in the lite one,
// so "Coco" isn't mistaken for a rude word just because c sounds like k.
const forms = s => { const lite = squash(s), full = phon(lite); return { la: lite, lb: collapse(lite), fa: full, fb: collapse(full) }; };
const prep = w => forms(leet(plain(w), 'i'));
const STRONG = LISTS.strong.map(w => prep(w).fa);
const SUB = LISTS.sub.map(w => { const f = prep(w); return { w, ...f, strong: STRONG.some(x => f.fa.includes(x)) }; }).filter(x => x.la.length >= 3);
const TOK = new Set(), TOK_SQ = new Set();
for (const w of LISTS.tok) {
  const f = prep(w);
  if (!f.la) continue;
  TOK.add(f.la);
  if (f.la === f.lb && f.lb.length >= 3) TOK_SQ.add(f.lb);   // "faaag" = fag, but "asss" isn't squashed down to "as"
}
const ALLOW = [
  ...LISTS.allow.map(w => ({ ...prep(w), curated: true })),
  ...LISTS.foot.map(w => ({ ...prep(w), curated: false })),
].filter(x => x.la.length >= 4);
const FOOT = new Set(LISTS.foot.map(w => prep(w).la));
const FIRST = new Set(LISTS.first);
const NICK_WORDS = new Set(('the legend king queen boy boys girl lad lads man men kid fc fan fans united utd city rovers town athletic magic junior jnr snr senior ' +
  'bhoy bhoys dog dawg great one two three goat boss gaffer big little wee mc da de of from no number jr sr og mor beag').split(' '));

// ---------- the checks ----------
function occurrences(hay, needle) {
  const out = []; let i = hay.indexOf(needle);
  while (i >= 0) { out.push(i); i = hay.indexOf(needle, i + 1); }
  return out;
}
// a blocked word inside an allowed one (arse in Arsenal, cunt in Scunthorpe, Fuchs) is let off
function excused(str, at, len, strong, key) {
  for (const al of ALLOW) {
    if (strong && !al.curated && key[0] !== 'f') continue;
    const f = al[key];
    if (f.length <= len) continue;
    for (const k of occurrences(str, f)) if (k <= at && at + len <= k + f.length) return true;
  }
  return false;
}
function rudeIn(str, key) {
  const squashed = key[1] === 'b';
  for (const x of SUB) {
    if (x.strong !== (key[0] === 'f')) continue;
    const f = x[key];
    // squashed spellings only for words with no double letters of their own, so Zúñiga isn't read as a slur
    if (squashed && x[key[0] + 'a'] !== f && f.length < 5) continue;
    if (f.length < (x.strong ? 3 : 4) && !(f.length === 3 && !squashed)) continue;
    for (const at of occurrences(str, f)) if (!excused(str, at, f.length, x.strong, key)) return x.w;
  }
  return null;
}

/** Is this name rude? Returns the word it found, or null. */
export function findRude(name) {
  const raw = String(name).replace(/([a-z])([A-Z])/g, '$1 $2');   // BigAssKev → Big Ass Kev
  const p = plain(raw);
  const one = leet(p, 'i');
  const fv = forms(one.replace(/v/g, 'u'));   // fvck, cvnt: only for the strong words, so Dickov stays Dickov
  const vHit = rudeIn(fv.fa, 'fa') || rudeIn(fv.fb, 'fb');
  if (vHit) return vHit;
  for (const v of [one, leet(p, 'l'), p.replace(/[0-9]/g, '')]) {
    const f = forms(v);
    const hit = rudeIn(f.la, 'la') || rudeIn(f.lb, 'lb') || rudeIn(f.fa, 'fa') || rudeIn(f.fb, 'fb');
    if (hit) return hit;
    const tokens = v.split(/[^a-z]+/).filter(Boolean);
    for (const t of [...tokens, f.la]) {
      if (TOK.has(t)) return t;
      if (TOK_SQ.has(collapse(t)) && !FOOT.has(t)) return t;   // Pukki is not puki
    }
    // words split by spaces or dots: "c o n", "p.u.t.a"
    for (let i = 0; i < tokens.length; i++) {
      let joined = '';
      for (let j = i; j < tokens.length && j < i + 8; j++) {
        joined += tokens[j];
        if (j > i && TOK.has(joined)) return joined;
      }
    }
  }
  return null;
}

const NICK_CHARS = /^[A-Za-z0-9À-ÖØ-öø-ſȘ-ț .'_-]+$/;
const LEAGUE_CHARS = /^[A-Za-z0-9À-ÖØ-öø-ſȘ-ț .'_\-&!?,()#+]+$/;

export const tidy = s => String(s ?? '').normalize('NFC').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

/**
 * Check a nickname or league name.
 * kind: 'nick' (3–16 characters) or 'league' (3–30 characters)
 * Returns { ok: true, name } or { ok: false, why, msg }.
 */
export function checkName(input, kind = 'nick') {
  const name = tidy(input);
  const max = kind === 'league' ? 30 : 16;
  const what = kind === 'league' ? 'League names' : 'Nicknames';
  if (name.length < 3 || name.length > max) return { ok: false, why: 'length', msg: `${what} need 3 to ${max} characters.` };
  if (/@/.test(name) && /\.\w/.test(name)) return { ok: false, why: 'email', msg: 'That looks like an email address. Pick a nickname instead.' };
  if (/\b(https?|www)\b|\.(com|ie|co|uk|net|org|io|me|tv|gg)\b/i.test(name)) return { ok: false, why: 'link', msg: 'Website addresses aren’t allowed in names.' };
  if ((name.match(/[0-9]/g) || []).length >= 6) return { ok: false, why: 'phone', msg: 'That looks like a phone number. Use fewer numbers.' };
  if (!(kind === 'league' ? LEAGUE_CHARS : NICK_CHARS).test(name)) {
    return { ok: false, why: 'chars', msg: kind === 'league' ? 'Use letters, numbers, spaces and simple punctuation only. No emoji.' : 'Use letters, numbers, spaces and . - _ \' only. No emoji.' };
  }
  if ((plain(name).match(/[a-z]/g) || []).length < 2) return { ok: false, why: 'letters', msg: `${what} need at least two letters.` };
  if (findRude(name)) return { ok: false, why: 'rude', msg: 'That name isn’t allowed. Try another one.' };
  if (kind === 'nick') {
    const words = name.split(' ');
    if (words.length === 2 && words.every(w => /^[A-Za-zÀ-ſ'-]{2,}$/.test(w)) && FIRST.has(plain(words[0])) && !NICK_WORDS.has(plain(words[1]))) {
      return { ok: false, why: 'realname', msg: 'That looks like a real name. Pick a nickname instead, so you stay anonymous.' };
    }
  }
  return { ok: true, name };
}

/** The form used to stop two players taking the same nickname ("Big Kev" = "bigkev" = "BIG KEV"). */
export const nameKey = s => phon(squash(leet(plain(tidy(s)), 'i')));
