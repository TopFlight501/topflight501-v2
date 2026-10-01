import { getSeasons, randomMatch, seasonLabel, clubsIn } from './data.js?v=7';
import { CATEGORIES, MANAGER_BONUS, checkDart, checkManager, displayName, shortName } from './answers.js?v=7';
import { sfx, setSoundEnabled } from './sound.js?v=7';

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const modalRoot = $('#modal');

const FEEDBACK_EMAIL = 'topflight501@outlook.com';

// ---------- games ----------
const CLOCK_TARGETS = ['lineup', 'booked', 'assist', 'scorer', 'scoreline', 'manager'];
const TARGET_INFO = {
  ...CATEGORIES,
  manager: { label: 'Manager', short: 'Manager', points: 0, icon: '🧑‍💼' },
};
const KILLER_LIVES = 3;
const ARMING = ['scorer', 'scoreline'];

const GAMES = {
  x01: {
    title: '501 Checkout', icon: '🎯', min: 1, max: 4,
    blurb: 'The classic. Every correct answer comes off your score. First to zero wins the leg.',
    tags: ['1–4 players', 'Manager bonus'],
  },
  killer: {
    title: 'Killer', icon: '🔪', min: 2, max: 4,
    blurb: 'Name a scorer or the scoreline to become a Killer, then knock lives off your mates. Last one standing wins.',
    tags: ['2–4 players', '3 lives each'],
  },
  clock: {
    title: 'Round the Grounds', icon: '🏟️', min: 1, max: 4,
    blurb: 'Hit every category in order, from a lineup player all the way to the manager. First round the ground wins.',
    tags: ['1–4 players', 'Race'],
  },
  sudden: {
    title: 'Sudden Death', icon: '⚡', min: 1, max: 1,
    blurb: 'Keep answering, match after match. Bigger categories score more. One wrong answer and it’s over.',
    tags: ['Solo', 'High score'],
  },
};

// ---------- state ----------
const S = {
  screen: 'hub',
  game: 'x01',
  nPlayers: 2,
  unit: 'managers',       // 'managers' | 'teams' (labels for x01 head-to-head)
  start: 501,
  names: ['', '', '', ''],
  seasonFrom: null,
  seasonTo: null,
  allSeasons: [],
  clubs: ['', ''],
  clubOptions: [],
  players: [],
  legStarter: 0,
  turnOrder: [],
  turnIdx: 0,
  round: 0,
  match: null,
  claimed: [],
  visit: [],
  cat: null,
  lastVisits: [],
  busy: false,
  error: null,
  legOver: false,
  pending: null,          // killer: waiting for the player to pick who loses a life
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

const BEST_KEYS = ['best:501', 'best:301', 'best:101', 'best:clock', 'best:sudden'];
function bestsList() {
  const out = [];
  for (const n of [501, 301, 101]) { const b = store.get('best:' + n, null); if (b) out.push(`${n} Checkout: <b>${b.darts} darts</b>`); }
  const c = store.get('best:clock', null); if (c) out.push(`Round the Grounds: <b>${c.darts} darts</b>`);
  const s = store.get('best:sudden', null); if (s) out.push(`Sudden Death: <b>${s.points} pts</b>`);
  return out;
}

function settingsHtml() {
  const seg = (key, opts) => `<div class="seg ${opts.length === 3 ? 'three' : ''}">${opts.map(([v, label]) =>
    `<button class="seg-btn ${String(settings[key]) === String(v) ? 'on' : ''}" data-act="set" data-k="${key}" data-v="${v}">${label}</button>`).join('')}</div>`;
  const bests = bestsList();
  return `
  <h2>Settings</h2>
  <div class="field"><span class="label">Theme</span>${seg('theme', [['system', 'System'], ['light', '☀️ Light'], ['dark', '🌙 Dark']])}</div>
  <div class="field"><span class="label">Sound effects</span>${seg('sound', [[true, '🔊 On'], [false, '🔇 Off']])}</div>
  ${canVibrate ? `<div class="field"><span class="label">Vibration</span>${seg('vibrate', [[true, '📳 On'], [false, 'Off']])}</div>` : ''}
  <div class="field">
    <span class="label">Personal bests (solo)</span>
    ${bests.length ? `<p class="hint">${bests.join('<br>')}</p>
      <button class="btn ghost" data-act="reset-bests">Reset personal bests</button>` : '<p class="hint">No personal bests yet.</p>'}
  </div>
  <button class="btn primary big" data-act="close">Done</button>`;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const current = () => S.players[S.turnOrder[S.turnIdx]];
const currentIdx = () => S.turnOrder[S.turnIdx];
const G = () => GAMES[S.game];

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

function clampPlayers() {
  const g = G();
  S.nPlayers = Math.min(g.max, Math.max(g.min, S.nPlayers));
}

// ---------- rendering ----------
function render() {
  if (S.screen === 'hub') return renderHub();
  if (S.screen === 'setup') return renderSetup();
  if (S.screen === 'handover') return renderHandover();
  if (S.screen === 'play') return renderPlay();
}

function renderHub() {
  app.innerHTML = `
  <section class="hub">
    <p class="eyebrow">Premier League trivia, darts style</p>
    <h2>Pick your game</h2>
    <div class="games">
      ${Object.entries(GAMES).map(([k, g]) => `
        <button class="game-card" data-act="pick" data-v="${k}">
          <span class="game-icon" aria-hidden="true">${g.icon}</span>
          <span class="game-body">
            <span class="game-title">${g.title}</span>
            <span class="game-blurb">${g.blurb}</span>
            <span class="game-tags">${g.tags.map(t => `<span>${t}</span>`).join('')}</span>
          </span>
          <span class="game-go" aria-hidden="true">›</span>
        </button>`).join('')}
    </div>
    ${S.error ? `<p class="error">${esc(S.error)}</p>` : ''}
  </section>`;
}

function renderSetup() {
  const g = G();
  clampPlayers();
  const multi = S.nPlayers > 1;
  const word = S.game === 'x01' && multi ? (S.unit === 'managers' ? 'Manager' : 'Team') : 'Player';
  const ordinals = ['one', 'two', 'three', 'four'];
  const seasonOpts = sel => S.allSeasons.map(s => `<option value="${s}" ${s === sel ? 'selected' : ''}>${seasonLabel(s)}</option>`).join('');
  const bestLine = (() => {
    if (multi) return '';
    if (S.game === 'x01') { const b = store.get('best:' + S.start, null); return b ? `Your best ${S.start} checkout: <b>${b.darts} darts</b>.` : ''; }
    if (S.game === 'clock') { const b = store.get('best:clock', null); return b ? `Your best: round the grounds in <b>${b.darts} darts</b>.` : ''; }
    if (S.game === 'sudden') { const b = store.get('best:sudden', null); return b ? `Your best: <b>${b.points} points</b> (${b.streak} in a row).` : ''; }
    return '';
  })();

  app.innerHTML = `
  <section class="card setup">
    <button class="back" data-act="hub">‹ All games</button>
    <p class="eyebrow">${g.icon} ${g.title}</p>
    <h2>Step to the oche</h2>
    ${store.get('hideRules:' + S.game, false) ? `
    <p class="hint setup-blurb">${g.blurb}</p>
    <button class="btn link show-rules" data-act="toggle-rules">📋 Show how ${g.title} works</button>` : `
    <div class="how">
      <div class="how-head">
        <span class="label">How it works</span>
        <button class="how-hide" data-act="toggle-rules" aria-label="Hide how it works">Hide ✕</button>
      </div>
      <ul class="how-list">${gameRules(S.game).replace(/<li>/g, '<li>')}</ul>
      <p class="hint">Three darts per match, everyone on the same match. Surnames and small typos are fine.</p>
    </div>`}

    ${g.max > 1 ? `
    <div class="field">
      <span class="label">Players</span>
      <div class="seg count c${g.max - g.min + 1}">
        ${Array.from({ length: g.max - g.min + 1 }, (_, i) => g.min + i).map(n => `<button class="seg-btn num ${S.nPlayers === n ? 'on' : ''}" data-act="count" data-v="${n}">${n === 1 ? 'Solo' : n}</button>`).join('')}
      </div>
    </div>` : ''}

    ${S.game === 'x01' && multi ? `
    <div class="field">
      <span class="label">Competing as</span>
      <div class="seg">
        <button class="seg-btn ${S.unit === 'managers' ? 'on' : ''}" data-act="unit" data-v="managers">🧑‍💼 Managers</button>
        <button class="seg-btn ${S.unit === 'teams' ? 'on' : ''}" data-act="unit" data-v="teams">👥 Teams</button>
      </div>
    </div>` : ''}

    <div class="names n${S.nPlayers}">
      ${Array.from({ length: S.nPlayers }, (_, i) => `
        <label class="field"><span class="label">${multi ? `${word} ${ordinals[i]}` : 'Your name'}</span>
        <input class="text" id="name-${i}" data-name="${i}" maxlength="20" placeholder="Enter name" value="${esc(S.names[i])}"></label>`).join('')}
    </div>
    ${bestLine ? `<p class="hint">${bestLine}</p>` : ''}

    ${S.game === 'x01' ? `
    <div class="field">
      <span class="label">Starting score</span>
      <div class="seg three">
        ${[501, 301, 101].map(n => `<button class="seg-btn num ${S.start === n ? 'on' : ''}" data-act="start" data-v="${n}">${n}</button>`).join('')}
      </div>
    </div>` : ''}

    <div class="field">
      <span class="label">Seasons</span>
      <div class="season-range">
        <select id="season-from" data-season="from" aria-label="From season">${seasonOpts(S.seasonFrom)}</select>
        <span>to</span>
        <select id="season-to" data-season="to" aria-label="To season">${seasonOpts(S.seasonTo)}</select>
      </div>
    </div>

    <div class="field">
      <span class="label">Preferred club <span class="opt">optional</span></span>
      <div class="clubs">
        <select id="club" data-club="0" aria-label="Preferred club">
          <option value="">Any club</option>
          ${S.clubOptions.map(c => `<option value="${esc(c)}" ${c === S.clubs[0] ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <p class="hint">${S.clubs[0] ? `Only ${esc(S.clubs[0])} matches.` : 'Matches from every club in the seasons you picked.'}</p>
    </div>

    ${S.error ? `<p class="error">${esc(S.error)}</p>` : ''}
    <button class="btn primary big" data-act="begin" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Loading…' : 'Game on'}</button>
    <button class="btn link" data-act="rules">📖 Full rules</button>
  </section>`;
}

function activeClubs() { return S.clubs[0] ? [S.clubs[0]] : []; }

async function refreshClubOptions() {
  try { S.clubOptions = await clubsIn(selectedSeasons()); } catch { S.clubOptions = []; }
  S.clubs = [S.clubOptions.includes(S.clubs[0]) ? S.clubs[0] : '', ''];
}

function hearts(p) {
  return Array.from({ length: KILLER_LIVES }, (_, i) => `<span class="${i < p.lives ? 'heart' : 'heart lost'}">${i < p.lives ? '❤️' : '🖤'}</span>`).join('');
}

function boardCell(p, i) {
  switch (S.game) {
    case 'killer':
      return `<div class="pl-lives">${p.out ? '<span class="out-tag">OUT</span>' : hearts(p)}</div>
        <div class="pl-sub">${p.out ? 'Knocked out' : p.armed ? '🔪 Killer' : 'Needs a scorer or scoreline'}</div>`;
    case 'clock': {
      const t = CLOCK_TARGETS[p.prog];
      return `<div class="pl-target">${t ? TARGET_INFO[t].icon + ' ' + TARGET_INFO[t].short : '🏁 Done'}</div>
        <div class="track">${CLOCK_TARGETS.map((_, k) => `<span class="${k < p.prog ? 'done' : k === p.prog ? 'now' : ''}"></span>`).join('')}</div>
        <div class="pl-sub">${p.darts} darts</div>`;
    }
    case 'sudden':
      return `<div class="pl-score" data-score="${i}">${p.points}</div><div class="pl-sub">${p.streak} in a row</div>`;
    default:
      return `<div class="pl-score" data-score="${i}">${p.score}</div><div class="pl-sub">${p.darts} darts</div>`;
  }
}

function scoreboard() {
  const idx = currentIdx();
  const n = S.players.length;
  return `<div class="board ${n === 1 ? 'solo' : ''} ${n > 2 ? 'many' : ''}">
    ${S.players.map((p, i) => `
      <div class="pl ${i === idx ? 'active' : ''} ${p.out ? 'is-out' : ''}">
        <div class="pl-name">${esc(p.name)}${n > 1 ? `<span class="legs" title="Games won">${p.legs}</span>` : ''}</div>
        ${boardCell(p, i)}
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

function prevLine(prev) {
  if (!prev) return '';
  if (S.game === 'x01') return `${esc(prev.name)} scored <b>${prev.points}</b> with that visit${prev.bonus ? ' (incl. Manager Bonus)' : ''}.`;
  if (S.game === 'killer') return `${esc(prev.name)} hit <b>${prev.hits}</b> of 3${prev.note ? `: ${esc(prev.note)}` : '.'}`;
  if (S.game === 'clock') return `${esc(prev.name)} moved on <b>${prev.hits}</b> ${prev.hits === 1 ? 'target' : 'targets'}.`;
  return '';
}

function renderHandover() {
  const p = current();
  const prev = S.lastVisits[S.lastVisits.length - 1];
  app.innerHTML = `
  ${scoreboard()}
  <section class="card handover">
    ${prev ? `<p class="prev">${prevLine(prev)}</p>` : ''}
    <p class="eyebrow">${S.turnIdx === 0 ? 'New match' : 'Same match, your turn'}</p>
    <h2>${esc(p.name)}, step up</h2>
    <p class="hint">${handoverHint(p)}</p>
    ${matchCard()}
    <button class="btn primary big" data-act="go">Throw darts</button>
  </section>`;
}

function handoverHint(p) {
  if (S.game === 'clock') return `Pass the device over. Your target: <b>${TARGET_INFO[CLOCK_TARGETS[p.prog]].label}</b>.`;
  if (S.game === 'killer') return p.armed ? 'Pass the device over. You’re a Killer: every hit takes a life.' : 'Pass the device over. Name a scorer or the scoreline to become a Killer.';
  return 'Pass the device over. Three darts on this match.';
}

function dartValue(d) {
  if (!d.res.correct) return '✗';
  if (S.game === 'x01') return '−' + d.res.points;
  if (S.game === 'sudden') return '+' + d.res.points;
  return '✓';
}

function dartSlots() {
  return `<div class="darts">${[0, 1, 2].map(i => {
    const d = S.visit[i];
    if (!d) return `<div class="dart ${i === S.visit.length ? 'next' : ''}"><span class="dart-n">Dart ${i + 1}</span></div>`;
    return `<div class="dart ${d.res.correct ? 'hit' : 'miss'}">
      <span class="dart-n">${TARGET_INFO[d.cat].short}</span>
      <span class="dart-v">${dartValue(d)}</span>
    </div>`;
  }).join('')}</div>`;
}

function allowedCats(p) {
  if (S.game === 'clock') return CLOCK_TARGETS[p.prog] ? [CLOCK_TARGETS[p.prog]] : [];
  return Object.keys(CATEGORIES);
}

function chipPoints(k, c) {
  if (S.game === 'x01') return `−${c.points}${c.redPoints ? '/' + c.redPoints : ''}`;
  if (S.game === 'sudden') return `+${c.points}${c.redPoints ? '/' + c.redPoints : ''}`;
  if (S.game === 'killer') return ARMING.includes(k) ? (current().armed ? 'Kill' : 'Arms') : (current().armed ? 'Kill' : '—');
  return 'Target';
}

function turnHeadRight(p) {
  if (S.game === 'x01') return `Needs ${p.score}`;
  if (S.game === 'killer') return p.armed ? '🔪 Killer' : 'Not armed yet';
  if (S.game === 'clock') return p.prog >= CLOCK_TARGETS.length ? '🏁 Finished' : `Target ${p.prog + 1} of ${CLOCK_TARGETS.length}`;
  if (S.game === 'sudden') return `${p.points} pts`;
  return '';
}

function renderPlay() {
  const p = current();
  const done = S.visit.length >= 3 || S.legOver || S.pending;
  const last = S.visit[S.visit.length - 1];
  const cats = allowedCats(p);
  if (cats.length === 1 && !done) S.cat = cats[0];
  const catBtns = cats.map(k => {
    const c = TARGET_INFO[k];
    return `
    <button class="chip ${S.cat === k ? 'on' : ''}" data-act="cat" data-v="${k}">
      <span class="chip-i">${c.icon}</span>
      <span class="chip-l">${c.short}</span>
      <span class="chip-p">${chipPoints(k, c)}</span>
    </button>`;
  }).join('');

  let input = '';
  if (S.cat === 'scoreline') {
    input = `<div class="scoreline">
      <label><span>${esc(S.match.home)}</span><input type="number" inputmode="numeric" min="0" max="15" data-sl="0" aria-label="Home goals"></label>
      <span class="dash">–</span>
      <label><span>${esc(S.match.away)}</span><input type="number" inputmode="numeric" min="0" max="15" data-sl="1" aria-label="Away goals"></label>
    </div>`;
  } else if (S.cat) {
    const ph = { scorer: 'Who scored?', assist: 'Who set one up?', lineup: 'Name anyone who played', booked: 'Who went in the book?', manager: 'Name either manager' }[S.cat];
    input = `<input class="text answer" data-answer autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="${ph}">`;
  }

  const label = cats.length === 1 ? `Dart ${S.visit.length + 1}: your target` : `Dart ${S.visit.length + 1}: pick a category`;
  const resultPts = r => S.game === 'x01' ? ` <b>−${r.points}</b>` : S.game === 'sudden' ? ` <b>+${r.points}</b>` : '';

  app.innerHTML = `
  ${scoreboard()}
  <section class="card play">
    ${matchCard()}
    <div class="turn-head"><h3>${esc(p.name)}</h3><span class="hint">${turnHeadRight(p)}</span></div>
    ${dartSlots()}
    ${last ? `<p class="result ${last.res.correct ? 'ok' : 'bad'}">${last.res.correct ? '🎯 ' : ''}${esc(last.res.message)}${last.res.correct ? resultPts(last.res) : ''}${last.extra ? `<span class="extra">${esc(last.extra)}</span>` : ''}</p>` : ''}
    ${!done ? `
      <form class="throw" data-form="throw" autocomplete="off">
        <span class="label">${label}</span>
        <div class="chips ${cats.length === 1 ? 'single' : ''}">${catBtns}</div>
        ${input}
        ${S.error ? `<p class="error">${esc(S.error)}</p>` : ''}
        <button class="btn primary big" type="submit" ${S.cat ? '' : 'disabled'}>Throw</button>
      </form>` : (S.legOver || S.pending) ? '' : `
      <button class="btn primary big" data-act="endvisit">${nextLabel()}</button>`}
    <div class="play-foot">
      <button class="btn ghost" data-act="key">📖 Answer key</button>
      <button class="btn ghost" data-act="rules">❓ Rules</button>
    </div>
  </section>`;
  const f = $('[data-answer]') || $('[data-sl="0"]');
  if (f && (!matchMedia('(hover: none)').matches || S.cat)) f.focus();
}

function nextLabel() {
  const remaining = S.turnOrder.slice(S.turnIdx + 1).filter(i => !S.players[i].out);
  return remaining.length ? 'Next player' : 'Next match';
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

const COMMON_RULES = `
  <li><b>Real matches.</b> Each round pulls a genuine Premier League match from 2016/17 to 2025/26. Pick seasons and a preferred club on the setup screen.</li>
  <li><b>Hotseat, three darts.</b> Everyone answers on the same match, three darts each, then a new match comes up.</li>
  <li><b>Spelling tolerance.</b> Surnames are fine and small typos are forgiven. Each answer only counts once per player per match.</li>
  <li><b>Answer key forfeit.</b> Stuck? The answer key shows everything, but the game ends and has to be restarted.</li>`;

const TIERS = `
  <table class="tiers">
    <tr><td>⚽ Scorer</td><td>60</td></tr>
    <tr><td>🔢 Exact scoreline</td><td>50</td></tr>
    <tr><td>🅰️ Assist provider</td><td>40</td></tr>
    <tr><td>👕 Lineup player</td><td>30</td></tr>
    <tr><td>🟨 Booked player</td><td>25 (🟥 red 50)</td></tr>
  </table>`;

function rulesHtml(game = S.screen === 'hub' ? null : S.game) {
  if (!game) {
    return `
    <h2>How to play</h2>
    <p>Every game uses real Premier League matches. You get three darts per match, and each dart is one answer: a scorer, an assist, the exact scoreline, a player in the lineup or someone who got booked.</p>
    ${Object.values(GAMES).map(g => `<p><b>${g.icon} ${g.title}.</b> ${g.blurb}</p>`).join('')}
    <p class="hint">Lineup counts anyone who played, starters and subs. Assists follow the official Premier League/FPL record.</p>
    <button class="btn primary big" data-act="close">Got it</button>`;
  }
  const specific = gameRules(game);
  return `
  <h2>${GAMES[game].icon} ${GAMES[game].title}</h2>
  <ol class="rules">${specific}${COMMON_RULES}</ol>
  <p class="hint">Lineup counts anyone who played, starters and subs. Assists follow the official Premier League/FPL record.</p>
  <button class="btn primary big" data-act="close">Got it</button>`;
}

function gameRules(game) {
  return {
    x01: `
      <li><b>Start on 501, 301 or 101.</b> Play solo for your fastest checkout, or 2–4 players head-to-head as Managers or Teams.</li>
      <li><b>Deduction tiers.</b> Pick any category for each dart. Correct answers come off your score. ${TIERS}</li>
      <li><b>🔥 Manager bonus.</b> Hit all three darts and you get a bonus guess: name either manager for another −${MANAGER_BONUS}.</li>
      <li><b>Checkout.</b> You don’t need exactly 0. The first player to reach 0 or below wins the leg.</li>`,
    killer: `
      <li><b>Three lives each.</b> 2–4 players.</li>
      <li><b>Become a Killer.</b> Name a <b>scorer</b> or the <b>exact scoreline</b> to arm yourself. Other answers don’t count until you’re armed.</li>
      <li><b>Go for the kill.</b> Once you’re a Killer, every correct answer of any type takes a life from a rival of your choice.</li>
      <li><b>Last one standing</b> wins. Knocked-out players skip their turns.</li>`,
    clock: `
      <li><b>Go round the ground.</b> Hit each target in order: 👕 Lineup player, 🟨 Booked player, 🅰️ Assist, ⚽ Scorer, 🔢 Exact scoreline, then the 🧑‍💼 <b>Manager</b> to finish.</li>
      <li><b>One target at a time.</b> Each correct dart moves you on to the next target, even within the same visit.</li>
      <li><b>Every target is possible.</b> Matches in this game always have at least one goal, one assist and one booking.</li>
      <li><b>First to finish wins.</b> Solo, try to get round in as few darts as you can.</li>`,
    sudden: `
      <li><b>Solo survival.</b> Answer three darts per match, match after match.</li>
      <li><b>Score as you go.</b> Each correct answer adds its points. ${TIERS}</li>
      <li><b>Risk it?</b> A scorer is worth twice a lineup player, but it’s harder to get right.</li>
      <li><b>One miss and it’s over.</b> Beat your highest score.</li>`,
  }[game];
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
  <button class="btn primary big" data-act="forfeit-done">${S.game === 'sudden' ? 'Start again' : 'Restart game'}</button>`;
}

// ---------- game flow ----------
async function begin() {
  clampPlayers();
  const multi = S.nPlayers > 1;
  const ordinals = ['One', 'Two', 'Three', 'Four'];
  const base = S.game === 'x01' && multi ? (S.unit === 'managers' ? 'Manager' : 'Team') : 'Player';
  S.players = Array.from({ length: S.nPlayers }, (_, i) => ({
    name: (S.names[i] || '').trim() || (multi ? `${base} ${ordinals[i]}` : 'Player'),
    legs: 0,
  }));
  S.legStarter = 0;
  store.set('setup', { game: S.game, nPlayers: S.nPlayers, unit: S.unit, start: S.start, names: S.names, from: S.seasonFrom, to: S.seasonTo, clubs: S.clubs });
  await startLeg();
}

function resetPlayer(p) {
  Object.assign(p, { score: S.start, darts: 0, lives: KILLER_LIVES, armed: false, out: false, prog: 0, points: 0, streak: 0 });
}

async function startLeg() {
  S.players.forEach(resetPlayer);
  S.legOver = false;
  S.pending = null;
  S.round = 0;
  S.matchesThisLeg = 0;
  await newRound();
}

async function newRound() {
  S.busy = true; S.error = null;
  try {
    S.match = await randomMatch(selectedSeasons(), activeClubs(), { rich: S.game === 'clock' });
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
  S.turnOrder = Array.from({ length: n }, (_, i) => (S.legStarter + i) % n).filter(i => !S.players[i].out);
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

function managerDart(guess, claimed) {
  if (String(guess).trim().length < 3) return { invalid: true, message: 'Type at least 3 letters.' };
  if (claimed.has('manager')) return { invalid: true, message: 'You already named the manager.' };
  const hit = checkManager(S.match, guess);
  return hit ? { correct: true, points: 0, key: 'manager', message: hit } : { correct: false, points: 0, message: 'Not either manager.' };
}

function throwDart() {
  if (S.legOver || S.pending) return;
  const p = current();
  const claimed = S.claimed[currentIdx()];
  let answer;
  if (S.cat === 'scoreline') answer = [$('[data-sl="0"]').value, $('[data-sl="1"]').value];
  else answer = ($('[data-answer]') || {}).value || '';
  const res = S.cat === 'manager' ? managerDart(answer, claimed) : checkDart(S.match, S.cat, answer, claimed);
  if (res.invalid) { S.error = res.message; render(); return; }
  S.error = null;
  p.darts += 1;
  const dart = { cat: S.cat, answer, res, extra: '' };
  if (res.correct) claimed.add(res.key);
  S.visit.push(dart);
  S.cat = null;

  const after = { win: false, pick: false, over: false };
  switch (S.game) {
    case 'x01':
      if (res.correct) p.score -= res.points;
      if (p.score <= 0) after.win = true;
      break;
    case 'killer':
      if (res.correct) {
        if (!p.armed) {
          if (ARMING.includes(dart.cat)) { p.armed = true; dart.extra = ' You’re a Killer! 🔪'; }
          else dart.extra = ' Correct, but you need a scorer or the scoreline to become a Killer.';
        } else {
          after.pick = true;
          S.pending = true;
        }
      }
      break;
    case 'clock':
      if (res.correct) {
        p.prog += 1;
        if (p.prog >= CLOCK_TARGETS.length) after.win = true;
        else dart.extra = ` Next target: ${TARGET_INFO[CLOCK_TARGETS[p.prog]].label}.`;
      }
      break;
    case 'sudden':
      if (res.correct) { p.points += res.points; p.streak += 1; }
      else after.over = true;
      break;
  }

  render();
  if (res.correct) { pulse(currentIdx()); sfx.hit(); buzz(40); } else { sfx.miss(); }

  if (after.win) { S.legOver = true; setTimeout(() => legWon(p), 650); return; }
  if (after.over) { S.legOver = true; setTimeout(suddenOver, 700); return; }
  if (after.pick) { setTimeout(pickVictim, 400); return; }
  if (S.game === 'x01' && S.visit.length === 3 && S.visit.every(d => d.res.correct)) setTimeout(managerBonus, 500);
}

// Killer: choose who loses a life
function pickVictim() {
  const p = current();
  const rivals = S.players.map((x, i) => ({ x, i })).filter(({ x, i }) => i !== currentIdx() && !x.out);
  openModal(`
    <p class="eyebrow">🔪 Killer strike</p>
    <h2>Who loses a life?</h2>
    <div class="victims">
      ${rivals.map(({ x, i }) => `
        <button class="victim" data-act="victim" data-v="${i}">
          <span class="victim-name">${esc(x.name)}</span>
          <span class="victim-lives">${hearts(x)}</span>
        </button>`).join('')}
    </div>`, { dismissable: false });
}

function hitVictim(i) {
  const v = S.players[i];
  const p = current();
  v.lives -= 1;
  const last = S.visit[S.visit.length - 1];
  if (v.lives <= 0) { v.out = true; last.extra = ` ${v.name} is knocked out!`; }
  else last.extra = ` ${v.name} loses a life.`;
  S.pending = null;
  modalRoot._onClose = null; closeModal();
  sfx.bonus(); buzz([40, 60, 40]);
  const alive = S.players.filter(x => !x.out);
  render();
  if (alive.length === 1) { S.legOver = true; setTimeout(() => legWon(p), 650); }
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
  if (S.legOver || S.pending) return;
  const p = current();
  const hits = S.visit.filter(d => d.res.correct).length;
  const pts = S.visit.reduce((t, d) => t + (d.res.correct ? d.res.points : 0), 0) + (S.visit.bonus || 0);
  const notes = S.visit.map(d => d.extra).filter(x => /knocked out|loses a life|Killer!/.test(x)).map(x => x.trim());
  S.lastVisits.push({ name: p.name, points: pts, bonus: !!S.visit.bonus, hits, note: notes.join(' ') });
  // move to the next player who is still in
  do { S.turnIdx += 1; } while (S.turnIdx < S.turnOrder.length && S.players[S.turnOrder[S.turnIdx]].out);
  if (S.turnIdx < S.turnOrder.length) startTurn();
  else newRound();
}

function legWon(p) {
  p.legs += 1;
  const solo = S.players.length === 1;
  let extra = '', big = '', eyebrow = 'Game shot!', title = `🎯 ${esc(p.name)} wins`;
  if (S.game === 'x01') {
    big = `<p class="big-score">${p.score}</p>`;
    title = `🎯 ${esc(p.name)} wins the leg`;
    if (solo) {
      const best = store.get('best:' + S.start, null);
      const isBest = !best || p.darts < best.darts;
      if (isBest) store.set('best:' + S.start, { darts: p.darts, matches: S.matchesThisLeg });
      extra = `<p>Checked out from ${S.start} in <b>${p.darts} darts</b> across ${S.matchesThisLeg} matches.${isBest ? ' <b>New personal best!</b>' : ` Best: ${best.darts} darts.`}</p>`;
    }
  } else if (S.game === 'killer') {
    eyebrow = 'Last one standing';
    title = `🔪 ${esc(p.name)} wins Killer`;
    big = `<p class="big-hearts">${hearts(p)}</p>`;
  } else if (S.game === 'clock') {
    eyebrow = 'Round the ground!';
    title = `🏟️ ${esc(p.name)} made it round`;
    if (solo) {
      const best = store.get('best:clock', null);
      const isBest = !best || p.darts < best.darts;
      if (isBest) store.set('best:clock', { darts: p.darts, matches: S.matchesThisLeg });
      extra = `<p>All six targets in <b>${p.darts} darts</b> across ${S.matchesThisLeg} matches.${isBest ? ' <b>New personal best!</b>' : ` Best: ${best.darts} darts.`}</p>`;
    } else {
      extra = `<p>Finished in <b>${p.darts} darts</b>.</p>`;
    }
  }
  if (!solo) extra += `<p class="legs-line">${S.players.map(x => `${esc(x.name)} <b>${x.legs}</b>`).join(' · ')}</p>`;
  confetti();
  sfx.win(); buzz([80, 60, 80, 60, 160]);
  S.legStarter = (S.legStarter + 1) % S.players.length;
  openModal(`
    <p class="eyebrow">${eyebrow}</p>
    <h2>${title}</h2>
    ${big}
    ${extra}
    <div class="row">
      <button class="btn ghost" data-act="newgame">Change game</button>
      <button class="btn primary" data-act="nextleg">${solo ? 'Go again' : 'Play again'}</button>
    </div>`, { dismissable: false });
}

function suddenOver() {
  const p = current();
  const best = store.get('best:sudden', null);
  const isBest = p.points > 0 && (!best || p.points > best.points);
  if (isBest) store.set('best:sudden', { points: p.points, streak: p.streak });
  const last = S.visit[S.visit.length - 1];
  if (isBest) { confetti(); sfx.win(); } else { sfx.miss(); }
  openModal(`
    <p class="eyebrow">⚡ Sudden death</p>
    <h2>${isBest ? 'New personal best!' : 'That’s the end of the road'}</h2>
    <p class="big-score">${p.points}</p>
    <p><b>${p.streak}</b> correct in a row across ${S.matchesThisLeg} ${S.matchesThisLeg === 1 ? 'match' : 'matches'}.${!isBest && best ? ` Best: ${best.points} pts.` : ''}</p>
    <p class="hint">The miss: ${esc(TARGET_INFO[last.cat].label)}, “${esc(Array.isArray(last.answer) ? last.answer.join('-') : last.answer)}”. ${esc(last.res.message)}</p>
    <div class="row">
      <button class="btn ghost" data-act="show-key">See answers</button>
      <button class="btn primary" data-act="nextleg">Go again</button>
    </div>
    <button class="btn link" data-act="newgame">Change game</button>`, { dismissable: false });
}

function answerKey() {
  openModal(`
    <h2>Open the answer key?</h2>
    <p>You’ll see every answer for this match, but <b>the current game ends</b> and has to be restarted.</p>
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
function goHub() { S.screen = 'hub'; S.error = null; renderHub(); }

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b) {
    if (e.target.classList.contains('overlay') && modalRoot._dismissable) closeModal();
    return;
  }
  const act = b.dataset.act, v = b.dataset.v;
  switch (act) {
    case 'pick': S.game = v; clampPlayers(); S.error = null; S.screen = 'setup'; renderSetup(); window.scrollTo(0, 0); break;
    case 'hub': goHub(); break;
    case 'count': S.nPlayers = Number(v); renderSetup(); break;
    case 'toggle-rules': store.set('hideRules:' + S.game, !store.get('hideRules:' + S.game, false)); renderSetup(); break;
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
      BEST_KEYS.forEach(k => store.set(k, null));
      openModal(settingsHtml());
      if (S.screen === 'setup') renderSetup();
      break;
    case 'close': closeModal(); break;
    case 'go': S.screen = 'play'; render(); break;
    case 'cat': e.preventDefault(); S.cat = v; S.error = null; renderPlay(); break;
    case 'victim': hitVictim(Number(v)); break;
    case 'endvisit': endVisit(); break;
    case 'bonus-skip': resolveBonus(''); break;
    case 'key': answerKey(); break;
    case 'forfeit': S.legOver = true; openModal(answerKeyHtml(), { dismissable: false }); break;
    case 'show-key': openModal(answerKeyHtml(), { dismissable: false }); break;
    case 'forfeit-done': modalRoot._onClose = null; closeModal(); S.legStarter = (S.legStarter + 1) % S.players.length; await startLeg(); break;
    case 'nextleg': modalRoot._onClose = null; closeModal(); await startLeg(); break;
    case 'newgame': modalRoot._onClose = null; closeModal(); goHub(); break;
    case 'home':
      if (S.screen === 'hub') break;
      if (S.screen === 'setup') { goHub(); break; }
      openModal(`<h2>Leave this game?</h2><p>Scores for this game will be lost.</p>
        <div class="row"><button class="btn ghost" data-act="close">Keep playing</button><button class="btn danger" data-act="leave">Leave game</button></div>`);
      break;
    case 'leave': modalRoot._onClose = null; closeModal(); goHub(); break;
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
  if (saved) {
    Object.assign(S, {
      game: GAMES[saved.game] ? saved.game : S.game,
      nPlayers: saved.nPlayers || (saved.mode === 'solo' ? 1 : 2),
      unit: saved.unit || S.unit,
      start: saved.start || S.start,
    });
    if (Array.isArray(saved.names)) S.names = [0, 1, 2, 3].map(i => saved.names[i] || '');
  }
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
