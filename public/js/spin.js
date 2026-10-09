// Spin the Board (preview): a spinning dartboard of Premier League clubs.
// Tap the board to throw; where the dart lands picks the club and the question.
import { getSeasons, getClubs, randomMatch, seasonLabel } from './data.js?v=75';
import { checkDart } from './answers.js?v=75';
const nm = p => p.web || p.full;
import { sfx } from './sound.js?v=75';

const COLOURS = {
  'Arsenal': ['#EF0107', '#FFFFFF'], 'Aston Villa': ['#670E36', '#95BFE5'], 'Bournemouth': ['#DA291C', '#111111'], 'Brentford': ['#E30613', '#FFFFFF'],
  'Brighton & Hove Albion': ['#0057B8', '#FFFFFF'], 'Burnley': ['#6C1D45', '#99D6EA'], 'Cardiff City': ['#0070B5', '#D11524'], 'Chelsea': ['#034694', '#FFFFFF'],
  'Crystal Palace': ['#1B458F', '#C4122E'], 'Everton': ['#003399', '#FFFFFF'], 'Fulham': ['#111111', '#FFFFFF'], 'Huddersfield Town': ['#0E63AD', '#FFFFFF'],
  'Hull City': ['#F5A12D', '#111111'], 'Ipswich Town': ['#3A64A3', '#FFFFFF'], 'Leeds United': ['#1D428A', '#FFCD00'], 'Leicester City': ['#003090', '#FDBE11'],
  'Liverpool': ['#C8102E', '#F6EB61'], 'Luton Town': ['#F78F1E', '#002D62'], 'Manchester City': ['#6CABDD', '#1C2C5B'], 'Manchester United': ['#DA291C', '#FBE122'],
  'Middlesbrough': ['#E11B22', '#FFFFFF'], 'Newcastle United': ['#241F20', '#FFFFFF'], 'Norwich City': ['#FFF200', '#00A650'], 'Nottingham Forest': ['#DD0000', '#FFFFFF'],
  'Sheffield United': ['#EE2737', '#111111'], 'Southampton': ['#D71920', '#FFFFFF'], 'Stoke City': ['#E03A3E', '#FFFFFF'], 'Sunderland': ['#EB172B', '#FFFFFF'],
  'Swansea City': ['#121212', '#FFFFFF'], 'Tottenham Hotspur': ['#132257', '#FFFFFF'], 'Watford': ['#FBEE23', '#ED2127'], 'West Bromwich Albion': ['#122F67', '#FFFFFF'],
  'West Ham United': ['#7A263A', '#1BB1E7'], 'Wolverhampton Wanderers': ['#FDB913', '#231F20'],
};
const CODE = {
  'Arsenal': 'ARS', 'Aston Villa': 'AVL', 'Bournemouth': 'BOU', 'Brentford': 'BRE', 'Brighton & Hove Albion': 'BHA', 'Burnley': 'BUR', 'Cardiff City': 'CAR',
  'Chelsea': 'CHE', 'Crystal Palace': 'CRY', 'Everton': 'EVE', 'Fulham': 'FUL', 'Huddersfield Town': 'HUD', 'Hull City': 'HUL', 'Ipswich Town': 'IPS',
  'Leeds United': 'LEE', 'Leicester City': 'LEI', 'Liverpool': 'LIV', 'Luton Town': 'LUT', 'Manchester City': 'MCI', 'Manchester United': 'MUN',
  'Middlesbrough': 'MID', 'Newcastle United': 'NEW', 'Norwich City': 'NOR', 'Nottingham Forest': 'NFO', 'Sheffield United': 'SHU', 'Southampton': 'SOU',
  'Stoke City': 'STK', 'Sunderland': 'SUN', 'Swansea City': 'SWA', 'Tottenham Hotspur': 'TOT', 'Watford': 'WAT', 'West Bromwich Albion': 'WBA',
  'West Ham United': 'WHU', 'Wolverhampton Wanderers': 'WOL',
};

// board geometry (viewBox -200..200)
const R = { bull: 30, in1: 92, tre: 104, out1: 150, dbl: 162, edge: 192 };
const RINGS = {
  single: { label: 'Lineup', cat: 'lineup', pts: 20, ask: c => `Name anyone who played for <b>${esc(c)}</b>` },
  treble: { label: 'Treble: Scorer', cat: 'scorer', pts: 60, ask: c => `Name a <b>${esc(c)}</b> scorer` },
  double: { label: 'Double: Scoreline', cat: 'scoreline', pts: 50, ask: () => `What was the <b>exact score</b>?` },
  bull: { label: 'Bullseye!', cat: 'scorer', pts: 100, ask: c => `Bullseye! Name a <b>${esc(c)}</b> scorer` },
};
const ROUNDS = 5, DARTS = 3;

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#spin-app');
const G = { clubs: [], seasons: [], clubSeasons: {}, players: [], round: 1, dart: 0, turn: 0, speed: 'normal', names: ['', '', '', ''], n: 1,
  angle: 0, vel: 0, target: 0, busy: false, q: null, stuck: [] };

// ---------- board ----------
function sector(r1, r2, a1, a2) {
  const p = (r, a) => `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  return `M${p(r1, a1)}L${p(r2, a1)}A${r2},${r2} 0 0 1 ${p(r2, a2)}L${p(r1, a2)}A${r1},${r1} 0 0 0 ${p(r1, a1)}Z`;
}
const lum = h => { const n = parseInt(h.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };
function boardSvg() {
  const seg = 2 * Math.PI / 20; let s = '';
  G.clubs.forEach((c, i) => {
    const a1 = -Math.PI / 2 + (i - 0.5) * seg, a2 = a1 + seg;
    const [c1, c2] = COLOURS[c] || ['#2e5f6b', '#ffffff'];
    const alt = i % 2 ? 0.86 : 1;
    s += `<g class="segc" data-i="${i}">`;
    s += `<path d="${sector(R.bull, R.in1, a1, a2)}" fill="${c1}" opacity="${alt}"/>`;
    s += `<path d="${sector(R.in1, R.tre, a1, a2)}" fill="${c2}"/>`;
    s += `<path d="${sector(R.tre, R.out1, a1, a2)}" fill="${c1}" opacity="${alt}"/>`;
    s += `<path d="${sector(R.out1, R.dbl, a1, a2)}" fill="${c2}"/>`;
    const am = (a1 + a2) / 2, rl = (R.dbl + R.edge) / 2, x = rl * Math.cos(am), y = rl * Math.sin(am), deg = am * 180 / Math.PI + 90;
    s += `<path d="${sector(R.bull, R.dbl, a1, a2)}" class="seg-hl"/></g>`;
    s += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" transform="rotate(${deg.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" class="lbl">${CODE[c] || c.slice(0, 3).toUpperCase()}</text>`;
  });
  // wires
  for (let i = 0; i < 20; i++) { const a = -Math.PI / 2 + (i - 0.5) * seg; s += `<line x1="${(R.bull * Math.cos(a)).toFixed(1)}" y1="${(R.bull * Math.sin(a)).toFixed(1)}" x2="${(R.dbl * Math.cos(a)).toFixed(1)}" y2="${(R.dbl * Math.sin(a)).toFixed(1)}" class="wire"/>`; }
  [R.in1, R.tre, R.out1, R.dbl].forEach(r => { s += `<circle r="${r}" class="wire ring"/>`; });
  s += `<circle r="${R.bull}" fill="#12B886"/><circle r="12" fill="#C8102E"/><circle r="${R.bull}" class="wire ring"/>`;
  return `<svg class="board" viewBox="-232 -232 464 464" aria-label="Spinning dartboard of Premier League clubs">
    <defs>
      <path id="arcTop" d="M -205 0 A 205 205 0 0 1 205 0"/>
      <path id="arcBot" d="M -224 0 A 224 224 0 0 0 224 0"/>
    </defs>
    <circle r="230" fill="#1E4B57"/>
    <circle r="228" fill="none" stroke="#F5C518" stroke-width="3"/>
    <circle r="196" fill="none" stroke="#F5C518" stroke-width="1.2" opacity=".8"/>
    <text class="brand"><textPath href="#arcTop" startOffset="50%">TOP FLIGHT 501</textPath></text>
    <text class="brand sub"><textPath href="#arcBot" startOffset="50%">FOOTBALL · DARTS · TRIVIA</textPath></text>
    <circle cx="-210" cy="0" r="3.2" fill="#F5C518"/><circle cx="210" cy="0" r="3.2" fill="#F5C518"/>
    <g id="rot"><circle r="${R.edge + 3}" fill="#10292f"/>${s}<g id="darts"></g></g>
  </svg>`;
}
function dartBody() {
  return `<line x1="0" y1="0" x2="0" y2="13" stroke="#cfd8dc" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="-3.4" y="12" width="6.8" height="20" rx="2.6" fill="#8a9aa0"/>
    ${[15, 18, 21, 24, 27, 30].map(y => `<line x1="-3.4" x2="3.4" y1="${y}" y2="${y}" stroke="#55666c" stroke-width=".9"/>`).join('')}
    <rect x="-1.6" y="31" width="3.2" height="14" fill="#F5C518"/>
    <path d="M0 41 L-11 58 L-9 68 L0 62 L9 68 L11 58 Z" fill="#12B886" stroke="#0a3d30" stroke-width="1"/>
    <path d="M0 43 L0 66" stroke="#1E4B57" stroke-width="3"/>`;
}
function dartSvg(x, y, rot = 0, sc = 0.95) {
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${sc})" class="dart"><circle r="2.2" fill="#0b1416" opacity=".5"/>${dartBody()}</g>`;
}

// ---------- spin loop ----------
let last = 0;
function tick(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  const want = G.target; G.vel += (want - G.vel) * Math.min(1, dt * (want > G.vel ? 1.5 : 3.2));
  G.angle = (G.angle + G.vel * dt) % 360;
  const rot = document.getElementById('rot'); if (rot) rot.setAttribute('transform', `rotate(${G.angle.toFixed(2)})`);
  requestAnimationFrame(tick);
}
const spinSpeed = () => (G.speed === 'hard' ? 95 : 48);

// ---------- throwing ----------
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function onBoardTap(ev) {
  if (G.busy || G.q || G.screen !== 'play') return;
  const svg = $('.board'); const r = svg.getBoundingClientRect();
  const k = 464 / r.width; const ax = (ev.clientX - r.left) * k - 232, ay = (ev.clientY - r.top) * k - 232;
  const sd = G.speed === 'hard' ? 17 : 13;
  const x = ax + gauss() * sd, y = ay + gauss() * sd;
  G.busy = true; sfx.click();
  // the dart flies up from the bottom of the screen, shrinking as it travels away from you
  const px = 1 / k, endX = r.left + (x + 232) * px, endY = r.top + (y + 232) * px;
  const W = innerWidth, H = innerHeight, startX = W / 2 + (endX - W / 2) * 0.35 + 30, startY = H + 60;
  const fly = document.getElementById('fly-g'); const t0 = performance.now(), D = 480;
  const step = now => {
    const p = Math.min(1, (now - t0) / D), e = p < 1 ? 1 - Math.pow(1 - p, 2.2) : 1;
    const cx = startX + (endX - startX) * e, cy = startY + (endY - startY) * e - Math.sin(Math.PI * e) * 70;
    const sc = px * (5 - 4.05 * e), tilt = (1 - e) * 18;
    let trail = '';
    for (let i = 1; i <= 3; i++) { const e2 = Math.max(0, e - i * 0.06); const tx = startX + (endX - startX) * e2, ty = startY + (endY - startY) * e2 - Math.sin(Math.PI * e2) * 70; trail += `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) rotate(${tilt}) scale(${(px * (5 - 4.05 * e2)).toFixed(3)})" opacity="${(0.18 / i).toFixed(2)}">${dartBody()}</g>`; }
    fly.innerHTML = trail + `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${tilt.toFixed(1)}) scale(${sc.toFixed(3)})">${dartBody()}</g>`;
    if (p < 1) return requestAnimationFrame(step);
    fly.innerHTML = '';
    const w = $('.board-wrap'); w.classList.remove('thunk'); void w.offsetWidth; w.classList.add('thunk');
    land(x, y);
  };
  requestAnimationFrame(step);
}
function land(x, y) {
  // convert to the board's own (rotating) frame so the dart sticks and spins with it
  const a = -G.angle * Math.PI / 180, lx = x * Math.cos(a) - y * Math.sin(a), ly = x * Math.sin(a) + y * Math.cos(a);
  const darts = document.getElementById('darts');
  darts.insertAdjacentHTML('beforeend', dartSvg(lx, ly, -G.angle + (Math.random() * 12 - 6)));
  G.target = 0; // board slows to a stop so you can see where it went
  const r = Math.hypot(lx, ly);
  let ang = Math.atan2(ly, lx) * 180 / Math.PI + 90; ang = (ang + 360 + 9) % 360;
  const ci = Math.floor(ang / 18) % 20, club = G.clubs[ci];
  let ring = null;
  if (r <= R.bull) ring = 'bull';
  else if (r <= R.in1) ring = 'single';
  else if (r <= R.tre) ring = 'treble';
  else if (r <= R.out1) ring = 'single';
  else if (r <= R.dbl) ring = 'double';
  buzz(30);
  if (ring && ring !== 'bull') { document.getElementById('rot').classList.add('picked'); document.querySelector(`.segc[data-i="${ci}"]`).classList.add('hit'); }
  if (!ring) { sfx.miss(); return settle({ miss: true, msg: 'Off the board! No question, no points.' }); }
  setTimeout(() => ask(ring, ring === 'bull' ? null : club), 650);
}
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} }

// ---------- questions ----------
async function findMatch(club, ring) {
  const seasons = G.clubSeasons[club] || G.seasons;
  for (let i = 0; i < 25; i++) {
    const m = await randomMatch(seasons, [club]);
    const side = m.home === club ? 0 : 1;
    const mine = m.players.filter(p => p.side === side).map(p => ({ ...p, og: 0 }));
    if (RINGS[ring].cat === 'scorer' && !mine.some(p => p.goals > 0)) continue;
    if (!mine.length) continue;
    return { m, side, mine };
  }
  return null;
}
async function ask(ring, club) {
  if (ring === 'bull') { G.q = { ring, pickClub: true }; G.busy = false; return renderPlay(); }
  const found = await findMatch(club, ring);
  if (!found) return settle({ miss: true, msg: `Couldn’t find a ${club} match, free dart!` });
  G.q = { ring, club, ...found, claimed: new Map() };
  G.busy = false; renderPlay();
  const inp = $('[data-answer]') || $('[data-sl="0"]'); if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 50);
}
function answerQ(form) {
  const q = G.q, info = RINGS[q.ring];
  let ans;
  if (info.cat === 'scoreline') ans = [form.querySelector('[data-sl="0"]').value, form.querySelector('[data-sl="1"]').value];
  else ans = form.querySelector('[data-answer]').value;
  const match = { ...q.m, players: q.mine };
  const res = checkDart(match, info.cat, ans, q.claimed);
  if (res.invalid) { q.err = res.message; return renderPlay(); }
  const p = G.players[G.turn];
  if (res.correct) { p.pts += info.pts; sfx.hit(); buzz([40, 30, 40]); } else sfx.miss();
  settle({ correct: res.correct, pts: res.correct ? info.pts : 0, msg: res.message, reveal: reveal(q) });
}
function reveal(q) {
  const info = RINGS[q.ring], m = q.m;
  if (info.cat === 'scoreline') return `It finished ${esc(m.home)} ${m.score[0]}–${m.score[1]} ${esc(m.away)}.`;
  if (info.cat === 'scorer') return `${esc(q.club)} scorers: ${[...new Set(q.mine.filter(p => p.goals > 0).map(nm))].map(esc).join(', ')}.`;
  return `A few who played: ${(q.mine.some(p => p.started) ? q.mine.filter(p => p.started) : q.mine).slice(0, 4).map(nm).map(esc).join(', ')}.`;
}
function settle(r) { G.last = r; G.busy = false; G.q = null; G.dart++; renderPlay(); }
function nextDart() {
  G.last = null;
  document.getElementById('rot').classList.remove('picked'); document.querySelectorAll('.segc.hit').forEach(e => e.classList.remove('hit'));
  if (G.dart >= DARTS) {
    G.dart = 0; G.turn++;
    if (G.turn >= G.players.length) { G.turn = 0; G.round++; }
    if (G.round > ROUNDS) return renderEnd();
    document.getElementById('darts').innerHTML = '';
    if (G.players.length > 1) { G.handover = true; }
  }
  G.target = spinSpeed(); renderPlay();
}

// ---------- screens ----------
function renderSetup() {
  G.screen = 'setup';
  app.innerHTML = `
  <section class="card">
    <p class="eyebrow"><a href="./" class="back">‹ All games</a> · Preview</p>
    <h2>🎡 Spin the Board</h2>
    <p class="hint">A dartboard of the 20 clubs from this season, spinning. <b>Tap the board</b> to throw. Where the dart lands picks the <b>club</b> and the <b>question</b>, from a real match they played.</p>
    <div class="legend">
      <div><span class="sw s1"></span>Single · name anyone who played <b>20</b></div>
      <div><span class="sw s3"></span>Treble · name a scorer <b>60</b></div>
      <div><span class="sw s2"></span>Double · the exact score <b>50</b></div>
      <div><span class="sw sb"></span>Bullseye · pick any club, name a scorer <b>100</b></div>
    </div>
    <p class="label">Players</p>
    <div class="seg count">${[1, 2, 3, 4].map(n => `<button class="seg-btn ${G.n === n ? 'on' : ''}" data-act="n" data-v="${n}">${n === 1 ? 'Solo' : n}</button>`).join('')}</div>
    ${G.n > 1 ? `<div class="names">${Array.from({ length: G.n }, (_, i) => `<input class="text" data-name="${i}" maxlength="16" placeholder="Player ${i + 1}" value="${esc(G.names[i])}">`).join('')}</div>` : ''}
    <p class="label">Spin speed</p>
    <div class="seg">${[['normal', 'Normal'], ['hard', '🌪️ Fast']].map(([v, l]) => `<button class="seg-btn ${G.speed === v ? 'on' : ''}" data-act="speed" data-v="${v}">${l}</button>`).join('')}</div>
    <p class="hint small">${ROUNDS} rounds, ${DARTS} darts each. Most points wins.</p>
    <button class="btn primary big" data-act="start">Game on</button>
  </section>`;
}
function scoreboard() {
  return `<div class="sb">${G.players.map((p, i) => `<div class="sb-p ${i === G.turn ? 'on' : ''}"><span>${esc(p.name)}</span><b>${p.pts}</b></div>`).join('')}</div>`;
}
function renderPlay() {
  G.screen = 'play';
  const p = G.players[G.turn], q = G.q, l = G.last;
  let panel;
  if (G.handover) {
    panel = `<div class="panel center"><p class="eyebrow">Round ${G.round} of ${ROUNDS}</p><h3>${esc(p.name)}, step up 🎯</h3><p class="hint">Pass the phone over. Three darts.</p><button class="btn primary big" data-act="ready">Throw darts</button></div>`;
  } else if (q && q.pickClub) {
    panel = `<div class="panel"><h3>🎯 Bullseye! Pick any club</h3><p class="hint">Name one of their scorers from a real match for <b>100</b>.</p>
      <div class="club-grid">${G.clubs.map(c => `<button class="club-b" data-act="bull-club" data-v="${esc(c)}" style="--c1:${(COLOURS[c] || ['#2e5f6b'])[0]}">${esc(CODE[c] || c)}</button>`).join('')}</div></div>`;
  } else if (q) {
    const info = RINGS[q.ring], m = q.m;
    panel = `<div class="panel">
      <div class="q-club" style="--c1:${(COLOURS[q.club] || ['#2e5f6b'])[0]};--c2:${(COLOURS[q.club] || ['', '#fff'])[1]}"><span class="q-badge">${esc(CODE[q.club] || '')}</span><b>${esc(q.club)}</b></div>
      <div class="q-tag">${esc(info.label)} · <b>${info.pts} pts</b></div>
      <div class="q-match"><span class="q-season">${esc(seasonLabel(m.season))}</span><b>${esc(m.home)}</b> v <b>${esc(m.away)}</b><span class="q-date">${new Date(m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
      <p class="q-ask">${info.ask(q.club)}</p>
      <form class="q-form" data-form>
        ${info.cat === 'scoreline'
          ? `<div class="sl"><input class="text" inputmode="numeric" data-sl="0" maxlength="2" aria-label="${esc(m.home)} goals"><span>–</span><input class="text" inputmode="numeric" data-sl="1" maxlength="2" aria-label="${esc(m.away)} goals"></div>`
          : `<input class="text" data-answer autocomplete="off" autocapitalize="words" placeholder="Surname is fine">`}
        <button class="btn primary" type="submit">Answer</button>
      </form>
      ${q.err ? `<p class="err">${esc(q.err)}</p>` : ''}
      <button class="btn link" data-act="pass">No idea, pass</button>
    </div>`;
  } else if (l) {
    panel = `<div class="panel center"><p class="res ${l.correct ? 'ok' : 'bad'}">${l.correct ? `🎯 +${l.pts}` : l.miss ? '💨 Missed' : '❌ Not this time'}</p>
      <p class="hint">${esc(l.msg || '')}${l.reveal ? `<br>${l.reveal}` : ''}</p>
      <button class="btn primary big" data-act="next">${G.dart >= DARTS ? (G.players.length > 1 ? 'Next player' : 'Next round') : 'Next dart'}</button></div>`;
  } else {
    panel = `<div class="panel center"><p class="tap-hint">👆 Tap the board to throw</p><p class="hint">Dart ${G.dart + 1} of ${DARTS} · Round ${G.round} of ${ROUNDS}</p></div>`;
  }
  const keep = $('.board-wrap');
  if (!keep) {
    app.innerHTML = `<div class="topbar"><a href="./" class="back">‹ Quit</a><span>🎡 Spin the Board</span></div>${'<div id="sbw"></div>'}<div class="board-wrap">${boardSvg()}<div class="pointer" aria-hidden="true"></div></div><div id="panel"></div>`;
    $('.board').addEventListener('pointerdown', onBoardTap);
  }
  $('#sbw').innerHTML = scoreboard();
  $('#panel').innerHTML = panel;
  $('.board-wrap').classList.toggle('dim', !!(q || G.handover || l));
}
function renderEnd() {
  G.screen = 'end'; G.target = 0;
  const sorted = [...G.players].sort((a, b) => b.pts - a.pts);
  const solo = G.players.length === 1, w = sorted[0];
  sfx.win();
  app.innerHTML = `<section class="card center">
    <p class="eyebrow">Full time</p>
    <h2>${solo ? `You scored ${w.pts}` : `🏆 ${esc(w.name)} wins!`}</h2>
    ${solo ? '' : `<div class="final">${sorted.map((p, i) => `<div><span>${i + 1}. ${esc(p.name)}</span><b>${p.pts}</b></div>`).join('')}</div>`}
    <div class="row"><a class="btn ghost" href="./">All games</a><button class="btn primary" data-act="again">Play again</button></div>
  </section>`;
}

// ---------- events ----------
app.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const v = b.dataset.v;
  switch (b.dataset.act) {
    case 'n': G.n = +v; renderSetup(); break;
    case 'speed': G.speed = v; renderSetup(); break;
    case 'start': case 'again':
      if (b.dataset.act === 'start') document.querySelectorAll('[data-name]').forEach(i => { G.names[+i.dataset.name] = i.value.trim(); });
      G.players = Array.from({ length: G.n }, (_, i) => ({ name: G.n === 1 ? 'You' : (G.names[i] || `Player ${i + 1}`), pts: 0 }));
      Object.assign(G, { round: 1, dart: 0, turn: 0, q: null, last: null, handover: G.n > 1 });
      app.innerHTML = ''; G.target = spinSpeed(); renderPlay(); break;
    case 'ready': G.handover = false; renderPlay(); break;
    case 'next': nextDart(); break;
    case 'pass': { const q = G.q; sfx.miss(); settle({ correct: false, msg: 'Passed.', reveal: reveal(q) }); break; }
    case 'bull-club': { G.busy = true; $('#panel').innerHTML = '<div class="panel center"><p class="hint">Finding a match…</p></div>'; const found = await findMatch(v, 'bull'); G.q = found ? { ring: 'bull', club: v, ...found, claimed: new Map() } : null; G.busy = false; renderPlay(); break; }
  }
});
app.addEventListener('submit', e => { e.preventDefault(); if (G.q && !G.q.pickClub) answerQ(e.target); });

document.body.insertAdjacentHTML('beforeend', '<svg id="fly" aria-hidden="true"><g id="fly-g"></g></svg>');
// ---------- boot ----------
window.__spinG = G; // preview only (used by the demo recording)
(async () => {
  G.seasons = await getSeasons();
  const map = await getClubs();
  const latest = G.seasons[G.seasons.length - 1];
  G.clubs = (map[latest] || []).slice(0, 20);
  G.clubs.forEach(c => { G.clubSeasons[c] = G.seasons.filter(s => (map[s] || []).includes(c)); });
  renderSetup();
  requestAnimationFrame(tick);
})();
