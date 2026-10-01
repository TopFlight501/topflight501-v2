import { getSeasons, randomMatch, seasonLabel, clubsIn } from './data.js?v=6';
import { CATEGORIES, MANAGER_BONUS, checkDart, checkManager, displayName, shortName } from './answers.js?v=6';
import { sfx, setSoundEnabled } from './sound.js?v=6';

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const modalRoot = $('#modal');

const FEEDBACK_EMAIL = 'topflight501@outlook.com';
const COFFEE_URL = 'https://buymeacoffee.com/TopFlight501';

// ---------- state ----------
const S = {
  screen: 'setup',
  mode: 'h2h',            // 'solo' | 'h2h'
  unit: 'managers',       // 'managers' | 'teams'
  start: 501,
  names: ['', ''],
  seasonFrom: null,
  seasonTo: null,
  allSeasons: [],
  clubs: ['', ''],        // preferred clubs ('' = none)
  clubOptions: [],
  players: [],            // { name, score, legs, darts, visits }
  legStarter: 0,
  turnOrder: [],
  turnIdx: 0,
  round: 0,
  match: null,
  claimed: [],            // per player Set of claimed answers for the current match
  visit: [],              // darts thrown this visit: { cat, answer, res }
  cat: null,
  lastVisits: [],         // summaries of earlier visits on this match
  busy: false,
  error: null,
};

const store = {
  get(k, d) { try { const v = localStorage.getItem('tf501:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tf501:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// ---------- settings ----------
const SETTINGS_DEFAULT = { theme: 'system', sound: true, vibrate: true };
let settings = { ...SETTINGS_DEFAULT, ...store.get('settings', {}) };
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

function applySettings() {
  const root = document.documentElement;
  if (settings.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', settings.theme);
  setSoundEnabled(settings.sound);
}
function saveSettings() { store.set('settings', settings); applySettings(); }
function buzz(pattern) { if (settings.vibrate && canVibrate) { try { navigator.vibrate(pattern); } catch { /* ignore */ } } }
applySettings();

function settingsHtml() {
  const seg = (key, opts) => `<div class="seg ${opts.length === 3 ? 'three' : ''}">${opts.map(([v, label]) =>
    `<button class="seg-btn ${String(settings[key]) === String(v) ? 'on' : ''}" data-act="set" data-k="${key}" data-v="${v}">${label}</button>`).join('')}</div>`;
  const bests = [501, 301, 101].map(n => [n, store.get('best:' + n, null)]).filter(([, b]) => b);
  return `
  <h2>Settings</h2>
  <div class="field"><span class="label">Theme</span>${seg('theme', [['system', 'System'], ['light', '☀️ Light'], ['dark', '🌙 Dark']])}</div>
  <div class="field"><span class="label">Sound effects</span>${seg('sound', [[true, '🔊 On'], [false, '🔇 Off']])}</div>
  ${canVibrate ? `<div class="field"><span class="label">Vibration</span>${seg('vibrate', [[true, '📳 On'], [false, 'Off']])}</div>` : ''}
  <div class="field">
    <span class="label">Personal bests (Solo Run)</span>
    ${bests.length ? `<p class="hint">${bests.map(([n, b]) => `${n}: <b>${b.darts} darts</b>`).join(' · ')}</p>
      <button class="btn ghost" data-act="reset-bests">Reset personal bests</button>` : '<p class="hint">No personal bests yet.</p>'}
  </div>
  <button class="btn primary big" data-act="close">Done</button>`;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const current = () => S.players[S.turnOrder[S.turnIdx]];
const currentIdx = () => S.turnOrder[S.turnIdx];

function fmtDate(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function selectedSeasons() {
  const all = S.allSeasons;
  const i = all.indexOf(S.seasonFrom), j = all.indexOf(S.seasonTo);
  if (i < 0 || j < 0) return all;
  return all.slice(Math.min(i, j), Math.max(i, j) + 1);
}

// ---------- rendering ----------
function render() {
  if (S.screen === 'setup') return renderSetup();
  if (S.screen === 'handover') return renderHandover();
  if (S.screen === 'play') return renderPlay();
}

function renderSetup() {
  const unitWord = S.unit === 'managers' ? 'Manager' : 'Team';
  const seasonOpts = sel => S.allSeasons.map(s => `<option value="${s}" ${s === sel ? 'selected' : ''}>${seasonLabel(s)}</option>`).join('');
  const best = store.get('best:' + S.start, null);
  app.innerHTML = `
  <section class="card setup">
    <p class="eyebrow">${S.mode === 'solo' ? 'Solo run' : 'Head-to-head trivia'}</p>
    <h2>Step to the oche</h2>

    <div class="field">
      <span class="label">Game mode</span>
      <div class="seg" role="radiogroup">
        <button class="seg-btn ${S.mode === 'h2h' ? 'on' : ''}" data-act="mode" data-v="h2h">⚔️ Versus</button>
        <button class="seg-btn ${S.mode === 'solo' ? 'on' : ''}" data-act="mode" data-v="solo">🎯 Solo run</button>
      </div>
    </div>

    ${S.mode === 'h2h' ? `
    <div class="field">
      <span class="label">Competing as</span>
      <div class="seg">
        <button class="seg-btn ${S.unit === 'managers' ? 'on' : ''}" data-act="unit" data-v="managers">🧑‍💼 Managers</button>
        <button class="seg-btn ${S.unit === 'teams' ? 'on' : ''}" data-act="unit" data-v="teams">👥 Teams</button>
      </div>
    </div>
    <div class="names">
      <label class="field"><span class="label">${unitWord} one</span><input class="text" data-name="0" maxlength="20" placeholder="Enter name" value="${esc(S.names[0])}"></label>
      <label class="field"><span class="label">${unitWord} two</span><input class="text" data-name="1" maxlength="20" placeholder="Enter name" value="${esc(S.names[1])}"></label>
    </div>` : `
    <label class="field"><span class="label">Your name</span><input class="text" data-name="0" maxlength="20" placeholder="Enter name" value="${esc(S.names[0])}"></label>
    ${best ? `<p class="hint">Your best ${S.start} checkout: <b>${best.darts} darts</b> over ${best.matches} matches.</p>` : ''}`}

    <div class="field">
      <span class="label">Starting score</span>
      <div class="seg three">
        ${[501, 301, 101].map(n => `<button class="seg-btn num ${S.start === n ? 'on' : ''}" data-act="start" data-v="${n}">${n}</button>`).join('')}
      </div>
    </div>

    <div class="field">
      <span class="label">Seasons</span>
      <div class="season-range">
        <select data-season="from" aria-label="From season">${seasonOpts(S.seasonFrom)}</select>
        <span>to</span>
        <select data-season="to" aria-label="To season">${seasonOpts(S.seasonTo)}</select>
      </div>
    </div>

    <div class="field">
      <span class="label">Preferred club <span class="opt">optional</span></span>
      <div class="clubs">
        <select data-club="0" aria-label="Preferred club">
          <option value="">Any club</option>
          ${S.clubOptions.map(c => `<option value="${esc(c)}" ${c === S.clubs[0] ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <p class="hint">${clubHint()}</p>
    </div>

    ${S.error ? `<p class="error">${esc(S.error)}</p>` : ''}
    <button class="btn primary big" data-act="begin" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Loading…' : 'Game on'}</button>
    <button class="btn link" data-act="rules">How to play</button>
  </section>`;
}

function activeClubs() {
  return S.clubs[0] ? [S.clubs[0]] : [];
}

function clubHint() {
  const c = activeClubs();
  if (!c.length) return 'Matches from every club in the seasons you picked.';
  return `Only ${esc(c[0])} matches.`;
}

async function refreshClubOptions() {
  try { S.clubOptions = await clubsIn(selectedSeasons()); } catch { S.clubOptions = []; }
  // drop a club that wasn't in the Premier League in the chosen seasons
  S.clubs = [S.clubOptions.includes(S.clubs[0]) ? S.clubs[0] : '', ''];
}

function scoreboard() {
  const idx = currentIdx();
  return `<div class="board ${S.players.length === 1 ? 'solo' : ''}">
    ${S.players.map((p, i) => `
      <div class="pl ${i === idx ? 'active' : ''}">
        <div class="pl-name">${esc(p.name)}${S.players.length > 1 ? `<span class="legs" title="Legs won">${p.legs}</span>` : ''}</div>
        <div class="pl-score" data-score="${i}">${p.score}</div>
        <div class="pl-sub">${p.darts} darts</div>
      </div>`).join('')}
  </div>`;
}

function matchCard() {
  const m = S.match;
  return `<div class="match">
    <div class="match-meta"><span>Premier League ${seasonLabel(m.season)}</span><span>Round ${S.round}</span></div>
    <div class="teams"><span class="team">${esc(m.home)}</span><span class="vs">v</span><span class="team">${esc(m.away)}</span></div>
    <div class="match-date">${fmtDate(m.date)}</div>
  </div>`;
}

function renderHandover() {
  const p = current();
  const prev = S.lastVisits[S.lastVisits.length - 1];
  app.innerHTML = `
  ${scoreboard()}
  <section class="card handover">
    ${prev ? `<p class="prev">${esc(prev.name)} scored <b>${prev.points}</b> with that visit${prev.bonus ? ' (incl. Manager Bonus)' : ''}.</p>` : ''}
    <p class="eyebrow">${S.turnIdx === 0 ? 'New match' : 'Same match, your turn'}</p>
    <h2>${esc(p.name)}, step up</h2>
    <p class="hint">Pass the device over. Three darts on this match.</p>
    ${matchCard()}
    <button class="btn primary big" data-act="go">Throw darts</button>
  </section>`;
}

function dartSlots() {
  return `<div class="darts">${[0, 1, 2].map(i => {
    const d = S.visit[i];
    if (!d) return `<div class="dart ${i === S.visit.length ? 'next' : ''}"><span class="dart-n">Dart ${i + 1}</span></div>`;
    const c = CATEGORIES[d.cat];
    return `<div class="dart ${d.res.correct ? 'hit' : 'miss'}">
      <span class="dart-n">${c.short}</span>
      <span class="dart-v">${d.res.correct ? '−' + d.res.points : '✗'}</span>
    </div>`;
  }).join('')}</div>`;
}

function renderPlay() {
  const p = current();
  const done = S.visit.length >= 3;
  const last = S.visit[S.visit.length - 1];
  const catBtns = Object.entries(CATEGORIES).map(([k, c]) => `
    <button class="chip ${S.cat === k ? 'on' : ''}" data-act="cat" data-v="${k}">
      <span class="chip-i">${c.icon}</span>
      <span class="chip-l">${c.short}</span>
      <span class="chip-p">−${c.points}${c.redPoints ? '/' + c.redPoints : ''}</span>
    </button>`).join('');

  let input = '';
  if (S.cat === 'scoreline') {
    input = `<div class="scoreline">
      <label><span>${esc(S.match.home)}</span><input type="number" inputmode="numeric" min="0" max="15" data-sl="0" aria-label="Home goals"></label>
      <span class="dash">–</span>
      <label><span>${esc(S.match.away)}</span><input type="number" inputmode="numeric" min="0" max="15" data-sl="1" aria-label="Away goals"></label>
    </div>`;
  } else if (S.cat) {
    const ph = { scorer: 'Who scored?', assist: 'Who set one up?', lineup: 'Name anyone who played', booked: 'Who went in the book?' }[S.cat];
    input = `<input class="text answer" data-answer autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="${ph}">`;
  }

  app.innerHTML = `
  ${scoreboard()}
  <section class="card play">
    ${matchCard()}
    <div class="turn-head"><h3>${esc(p.name)}</h3><span class="hint">Needs ${p.score}</span></div>
    ${dartSlots()}
    ${last ? `<p class="result ${last.res.correct ? 'ok' : 'bad'}">${last.res.correct ? '🎯 ' : ''}${esc(last.res.message)}${last.res.correct ? ` <b>−${last.res.points}</b>` : ''}</p>` : ''}
    ${!done ? `
      <form class="throw" data-form="throw" autocomplete="off">
        <span class="label">Dart ${S.visit.length + 1}: pick a category</span>
        <div class="chips">${catBtns}</div>
        ${input}
        ${S.error ? `<p class="error">${esc(S.error)}</p>` : ''}
        <button class="btn primary big" type="submit" ${S.cat ? '' : 'disabled'}>Throw</button>
      </form>` : `
      <button class="btn primary big" data-act="endvisit">${S.turnIdx < S.turnOrder.length - 1 ? 'Next player' : 'Next match'}</button>`}
    <div class="play-foot">
      <button class="btn ghost" data-act="key">📖 Answer key</button>
      <button class="btn ghost" data-act="rules">❓ Rules</button>
    </div>
  </section>`;
  const f = $('[data-answer]') || $('[data-sl="0"]');
  if (f && !matchMedia('(hover: none)').matches) f.focus();
  else if (f && S.cat) f.focus();
}

// ---------- modals ----------
function openModal(html, { onClose, dismissable = true } = {}) {
  modalRoot.innerHTML = `<div class="overlay"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  modalRoot.hidden = false;
  modalRoot._onClose = onClose || null;
  modalRoot._dismissable = dismissable;
  const first = $('input, button', modalRoot);
  if (first) first.focus();
}
function closeModal() {
  modalRoot.hidden = true;
  modalRoot.innerHTML = '';
  const cb = modalRoot._onClose; modalRoot._onClose = null;
  if (cb) cb();
}

function rulesHtml() {
  return `
  <h2>How to play</h2>
  <ol class="rules">
    <li><b>Step to the oche.</b> Go for a quick checkout in a Solo Run, or play Head-to-Head as Managers or Teams. Everyone starts on 501, 301 or 101. Pick a preferred club to get only their matches.</li>
    <li><b>The trivia engine.</b> Each round pulls a genuine Premier League match from 2016/17 to 2025/26. Every answer comes from official match data.</li>
    <li><b>Hotseat and three darts.</b> Everyone throws at the same match, three darts each. Then a new match comes up for the next round.</li>
    <li><b>Deduction tiers.</b> Pick any category for each dart. Hit all three and you unlock the Manager Bonus.
      <table class="tiers">
        <tr><td>⚽ Scorer</td><td>−60</td></tr>
        <tr><td>🔢 Exact scoreline</td><td>−50</td></tr>
        <tr><td>🅰️ Assist provider</td><td>−40</td></tr>
        <tr><td>👕 Lineup player</td><td>−30</td></tr>
        <tr><td>🟨 Booked player</td><td>−25 (🟥 red −50)</td></tr>
        <tr><td>🔥 Manager bonus (3 out of 3)</td><td>−20</td></tr>
      </table></li>
    <li><b>Checkout.</b> You don’t need exactly 0. The first player to reach 0 or below wins the leg straight away.</li>
    <li><b>Spelling tolerance.</b> Surnames are fine and small typos are forgiven. Each answer only counts once per player per match.</li>
    <li><b>Answer key forfeit.</b> Stuck? The answer key shows everything, but the leg ends and has to be restarted.</li>
  </ol>
  <p class="hint">Lineup counts anyone who played, starters and subs. Assists follow the official Premier League/FPL record.</p>
  <button class="btn primary big" data-act="close">Got it</button>`;
}

function answerKeyHtml() {
  const m = S.match;
  const side = i => m.players.filter(p => p.side === i);
  const list = (arr, fmt) => arr.length ? arr.map(fmt).join(', ') : '<span class="muted">None</span>';
  const col = i => {
    const ps = side(i);
    const starters = ps.filter(p => p.started !== false);
    const subs = ps.filter(p => p.started === false);
    const known = ps.some(p => p.started !== null);
    return `
    <div class="key-col">
      <h4>${esc(i === 0 ? m.home : m.away)}</h4>
      <p><span class="k">Manager</span> ${esc(m.managers[i] || 'Unknown')}</p>
      <p><span class="k">⚽ Scorers</span> ${list(ps.filter(p => p.goals), p => esc(shortName(p)) + (p.goals > 1 ? ` ×${p.goals}` : ''))}</p>
      <p><span class="k">🅰️ Assists</span> ${list(ps.filter(p => p.assists), p => esc(shortName(p)) + (p.assists > 1 ? ` ×${p.assists}` : ''))}</p>
      <p><span class="k">🟨🟥 Cards</span> ${list(ps.filter(p => p.card), p => esc(shortName(p)) + (p.card === 2 ? ' 🟥' : ' 🟨'))}</p>
      <p><span class="k">👕 ${known ? 'Started' : 'Played'}</span> ${list(known ? starters : ps, p => esc(displayName(p)))}</p>
      ${known ? `<p><span class="k">🔁 Subs used</span> ${list(subs, p => esc(displayName(p)))}</p>` : ''}
    </div>`;
  };
  return `
  <h2>Answer key</h2>
  <div class="key-score">${esc(m.home)} <b>${m.score[0]} – ${m.score[1]}</b> ${esc(m.away)}</div>
  <p class="hint center">${fmtDate(m.date)}</p>
  <div class="key-grid">${col(0)}${col(1)}</div>
  <p class="hint">Something wrong? <a href="mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Match data report ' + m.id)}&body=${encodeURIComponent(`Match: ${m.home} ${m.score[0]}-${m.score[1]} ${m.away} (${m.date}, id ${m.id})\n\nWhat's wrong:\n`)}">Report this match</a></p>
  <button class="btn primary big" data-act="forfeit-done">Restart leg</button>`;
}

// ---------- game flow ----------
async function begin() {
  const names = S.mode === 'solo' ? [S.names[0]] : S.names.slice(0, 2);
  const fallback = S.mode === 'solo' ? ['Player'] : (S.unit === 'managers' ? ['Manager One', 'Manager Two'] : ['Team One', 'Team Two']);
  S.players = names.map((n, i) => ({ name: n.trim() || fallback[i], score: S.start, legs: 0, darts: 0 }));
  S.legStarter = 0;
  store.set('setup', { mode: S.mode, unit: S.unit, start: S.start, names: S.names, from: S.seasonFrom, to: S.seasonTo, clubs: S.clubs });
  await startLeg();
}

async function startLeg() {
  S.players.forEach(p => { p.score = S.start; p.darts = 0; });
  S.legOver = false;
  S.round = 0;
  S.matchesThisLeg = 0;
  await newRound();
}

async function newRound() {
  S.busy = true; S.error = null;
  try {
    S.match = await randomMatch(selectedSeasons(), activeClubs());
  } catch (e) {
    S.busy = false;
    S.error = e && /clubs|No matches/.test(e.message) ? e.message : 'Couldn’t load a match. Check your connection and try again.';
    S.screen = 'setup';
    render();
    return;
  }
  S.busy = false;
  S.round += 1;
  S.matchesThisLeg += 1;
  const n = S.players.length;
  S.turnOrder = Array.from({ length: n }, (_, i) => (S.legStarter + i) % n);
  S.turnIdx = 0;
  S.claimed = S.players.map(() => new Set());
  S.lastVisits = [];
  startTurn();
}

function startTurn() {
  S.visit = [];
  S.cat = null;
  S.error = null;
  S.screen = S.players.length > 1 ? 'handover' : 'play';
  render();
}

function throwDart() {
  if (S.legOver) return;
  const p = current();
  let answer;
  if (S.cat === 'scoreline') answer = [$('[data-sl="0"]').value, $('[data-sl="1"]').value];
  else answer = ($('[data-answer]') || {}).value || '';
  const res = checkDart(S.match, S.cat, answer, S.claimed[currentIdx()]);
  if (res.invalid) { S.error = res.message; render(); return; }
  S.error = null;
  p.darts += 1;
  if (res.correct) {
    S.claimed[currentIdx()].add(res.key);
    p.score -= res.points;
  }
  S.visit.push({ cat: S.cat, answer, res });
  S.cat = null;
  render();
  if (res.correct) { pulse(currentIdx()); sfx.hit(); buzz(40); } else { sfx.miss(); }
  if (p.score <= 0) { S.legOver = true; return setTimeout(() => legWon(p), 650); }
  if (S.visit.length === 3 && S.visit.every(d => d.res.correct)) setTimeout(managerBonus, 500);
}

function managerBonus() {
  const m = S.match;
  openModal(`
    <p class="eyebrow">🔥 Three from three</p>
    <h2>Tactical manager bonus</h2>
    <p>Name the manager of <b>either</b> team for another <b>−${MANAGER_BONUS}</b>.</p>
    <p class="hint">${esc(m.home)} v ${esc(m.away)}, ${fmtDate(m.date)}</p>
    <form data-form="bonus" autocomplete="off">
      <input class="text" data-bonus placeholder="Manager’s name" autocapitalize="words" spellcheck="false">
      <div class="row">
        <button class="btn ghost" type="button" data-act="bonus-skip">Pass</button>
        <button class="btn primary" type="submit">Go for it</button>
      </div>
    </form>`, { dismissable: false });
}

function resolveBonus(guess) {
  const p = current();
  const hit = guess ? checkManager(S.match, guess) : null;
  S.visit.bonus = hit ? MANAGER_BONUS : 0;
  if (hit) { p.score -= MANAGER_BONUS; sfx.bonus(); buzz([40, 60, 40]); } else { sfx.miss(); }
  openModal(`
    <h2>${hit ? '🔥 Bonus!' : 'No bonus'}</h2>
    <p>${hit ? `${esc(hit)}, correct. <b>−${MANAGER_BONUS}</b>` : `The managers were <b>${esc(S.match.managers[0])}</b> and <b>${esc(S.match.managers[1])}</b>.`}</p>
    <button class="btn primary big" data-act="close">Continue</button>`, {
    onClose: () => { render(); if (hit) pulse(currentIdx()); if (p.score <= 0) { S.legOver = true; setTimeout(() => legWon(p), 500); } },
  });
}

function endVisit() {
  if (S.legOver) return;
  const p = current();
  const pts = S.visit.reduce((t, d) => t + (d.res.correct ? d.res.points : 0), 0) + (S.visit.bonus || 0);
  S.lastVisits.push({ name: p.name, points: pts, bonus: !!S.visit.bonus });
  S.turnIdx += 1;
  if (S.turnIdx < S.turnOrder.length) startTurn();
  else newRound();
}

function legWon(p) {
  p.legs += 1;
  const solo = S.players.length === 1;
  let extra = '';
  if (solo) {
    const best = store.get('best:' + S.start, null);
    const isBest = !best || p.darts < best.darts;
    if (isBest) store.set('best:' + S.start, { darts: p.darts, matches: S.matchesThisLeg });
    extra = `<p>Checked out from ${S.start} in <b>${p.darts} darts</b> across ${S.matchesThisLeg} matches.${isBest ? ' <b>New personal best!</b>' : ` Best: ${best.darts} darts.`}</p>`;
  } else {
    extra = `<p class="legs-line">${S.players.map(x => `${esc(x.name)} <b>${x.legs}</b>`).join(' · ')}</p>`;
  }
  confetti();
  sfx.win(); buzz([80, 60, 80, 60, 160]);
  S.legStarter = (S.legStarter + 1) % S.players.length;
  openModal(`
    <p class="eyebrow">Game shot!</p>
    <h2>🎯 ${esc(p.name)} wins the leg</h2>
    <p class="big-score">${p.score}</p>
    ${extra}
    <div class="row">
      <button class="btn ghost" data-act="newgame">New game</button>
      <button class="btn primary" data-act="nextleg">${solo ? 'Go again' : 'Next leg'}</button>
    </div>`, { dismissable: false });
}

function answerKey() {
  openModal(`
    <h2>Open the answer key?</h2>
    <p>You’ll see every answer for this match, but <b>the current leg ends</b> and has to be restarted.</p>
    <div class="row">
      <button class="btn ghost" data-act="close">Keep playing</button>
      <button class="btn danger" data-act="forfeit">Show answers</button>
    </div>`);
}

// ---------- effects ----------
function pulse(i) {
  const el = $(`[data-score="${i}"]`);
  if (!el) return;
  el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const W = c.width = innerWidth, H = c.height = innerHeight;
  const colors = ['#1E4B57', '#12B886', '#F5C518', '#E03131', '#FFFFFF'];
  const bits = Array.from({ length: 140 }, () => ({
    x: W / 2, y: H * 0.35, vx: (Math.random() - 0.5) * 14, vy: Math.random() * -14 - 4,
    s: Math.random() * 6 + 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[Math.floor(Math.random() * colors.length)],
  }));
  let t = 0;
  (function step() {
    ctx.clearRect(0, 0, W, H);
    for (const b of bits) {
      b.vy += 0.35; b.x += b.vx; b.y += b.vy; b.r += b.vr; b.vx *= 0.99;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); ctx.restore();
    }
    if (++t < 160) requestAnimationFrame(step); else c.remove();
  })();
}

// ---------- events ----------
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b) {
    if (e.target.classList.contains('overlay') && modalRoot._dismissable) closeModal();
    return;
  }
  const act = b.dataset.act, v = b.dataset.v;
  switch (act) {
    case 'mode': S.mode = v; renderSetup(); break;
    case 'unit': S.unit = v; renderSetup(); break;
    case 'start': S.start = Number(v); renderSetup(); break;
    case 'begin': S.busy = true; renderSetup(); await begin(); break;
    case 'rules': openModal(rulesHtml()); break;
    case 'settings': openModal(settingsHtml()); break;
    case 'set': {
      const k = b.dataset.k; settings[k] = k === 'theme' ? v : v === 'true';
      saveSettings();
      if (k === 'sound' && settings.sound) sfx.hit();
      if (k === 'vibrate' && settings.vibrate) buzz(40);
      openModal(settingsHtml());
      break;
    }
    case 'reset-bests':
      [501, 301, 101].forEach(n => store.set('best:' + n, null));
      openModal(settingsHtml());
      if (S.screen === 'setup') renderSetup();
      break;
    case 'close': closeModal(); break;
    case 'go': S.screen = 'play'; render(); break;
    case 'cat': e.preventDefault(); S.cat = v; S.error = null; renderPlay(); break;
    case 'endvisit': endVisit(); break;
    case 'bonus-skip': resolveBonus(''); break;
    case 'key': answerKey(); break;
    case 'forfeit': openModal(answerKeyHtml(), { dismissable: false }); break;
    case 'forfeit-done': modalRoot._onClose = null; closeModal(); S.legStarter = (S.legStarter + 1) % S.players.length; await startLeg(); break;
    case 'nextleg': modalRoot._onClose = null; closeModal(); await startLeg(); break;
    case 'newgame': modalRoot._onClose = null; closeModal(); S.screen = 'setup'; renderSetup(); break;
    case 'home':
      if (S.screen === 'setup') break;
      openModal(`<h2>Leave this game?</h2><p>Scores for this game will be lost.</p>
        <div class="row"><button class="btn ghost" data-act="close">Keep playing</button><button class="btn danger" data-act="leave">Leave game</button></div>`);
      break;
    case 'leave': modalRoot._onClose = null; closeModal(); S.screen = 'setup'; renderSetup(); break;
  }
});

document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target.dataset.form;
  if (f === 'throw' && S.cat) throwDart();
  if (f === 'bonus') resolveBonus($('[data-bonus]').value);
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.name !== undefined) S.names[Number(t.dataset.name)] = t.value;
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.season) {
    if (t.dataset.season === 'from') S.seasonFrom = t.value;
    if (t.dataset.season === 'to') S.seasonTo = t.value;
    await refreshClubOptions();
    renderSetup();
  }
  if (t.dataset.club !== undefined) {
    S.clubs = [t.value, ''];
    renderSetup();
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !modalRoot.hidden && modalRoot._dismissable) closeModal();
});

// ---------- boot ----------
(async function boot() {
  const saved = store.get('setup', null);
  if (saved) Object.assign(S, { mode: saved.mode || S.mode, unit: saved.unit || S.unit, start: saved.start || S.start, names: saved.names || S.names });
  try {
    S.allSeasons = await getSeasons();
  } catch {
    S.allSeasons = [];
    S.error = 'Couldn’t load the match database. Please refresh.';
  }
  S.seasonFrom = saved && S.allSeasons.includes(saved.from) ? saved.from : S.allSeasons[0];
  S.seasonTo = saved && S.allSeasons.includes(saved.to) ? saved.to : S.allSeasons[S.allSeasons.length - 1];
  if (saved && Array.isArray(saved.clubs)) S.clubs = [saved.clubs[0] || '', ''];
  await refreshClubOptions();
  render();
  hideSplash();
})();

function hideSplash() {
  const el = document.getElementById('splash');
  if (!el || el.classList.contains('out')) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minShow = reduced ? 900 : 2200;
  const wait = Math.max(0, minShow - (Date.now() - (window.__splashStart || 0)));
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, wait);
}
document.addEventListener('click', e => {
  const el = document.getElementById('splash');
  if (el && el.contains(e.target) && S.allSeasons.length) { el.classList.add('out'); setTimeout(() => el.remove(), 500); }
}, true);
