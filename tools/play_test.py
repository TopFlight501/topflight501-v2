"""Plays real games on two phones and checks leagues end to end.
  rm -f .dev/play.sqlite && DB_FILE=.dev/play.sqlite PORT=8800 node tools/dev-server.mjs   (separate terminal)
  BASE=http://localhost:8800 python tools/play_test.py
Phone A and phone B pick nicknames, A starts a full season and B joins, A kicks off, both play today's
Daily Match by typing answers, then A plays The Classic (101) and sends a challenge link that B plays.
Answers come from the match shown on screen, looked up in the match database like a human would."""
import json, os, sys, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:8800')
SHOTS = os.environ.get('SHOTS', '.dev/shots')
os.makedirs(SHOTS, exist_ok=True)
fails, errors, log = [], [], []
def check(c, what):
    print(('ok   ' if c else 'FAIL ') + what); (None if c else fails.append(what))

MATCH_JS = """async () => {
  const meta = document.querySelector('.match-meta span').textContent.match(/(\\d{4})\\/(\\d{2})/);
  const season = `${meta[1]}-${meta[2]}`;
  const [h, a] = [...document.querySelectorAll('.match .team')].map(e => e.textContent.trim());
  const D = await (await fetch(`data/${season}.json?v=3`)).json();
  const m = D.matches.find(x => x.h === h && x.a === a);
  return { id: m.id, h, a, score: m.s, players: m.p.map(([id, side, g, as, card]) => ({ name: D.players[id][0], g, as, card })) };
}"""

def plan(m):
    """Best answers first: every goal, the scoreline, assists, bookings, then lineup players."""
    out = []
    for p in m['players']: out += [('scorer', p['name'])] * p['g']
    out.append(('scoreline', m['score']))
    for p in m['players']: out += [('assist', p['name'])] * p['as']
    out += [('booked', p['name']) for p in m['players'] if p['card']]
    out += [('lineup', p['name']) for p in m['players'] if not p['g'] and not p['as'] and not p['card']]
    return out

def throw(pg, cat, ans):
    pg.click(f'.chips [data-v={cat}]')
    if cat == 'scoreline':
        pg.fill('[data-sl="0"]', str(ans[0])); pg.fill('[data-sl="1"]', str(ans[1]))
    else:
        pg.fill('[data-answer]', ans)
    pg.click('form[data-form=throw] button[type=submit]')
    pg.wait_for_timeout(350)
    if pg.is_visible('text=Already used'): pg.click('#modal [data-act=close]')
    res = pg.inner_text('.result') if pg.locator('.result').count() else ''
    log.append(f'{cat}: {ans} → {res.strip()[:60]}')
    return res

def phone(br, name):
    c = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    c.add_init_script("navigator.share = async d => { window.__shared = d; }; localStorage.setItem('tf501:welcomed','true'); localStorage.setItem('tf501:tipClassic','true');")
    pg = c.new_page()
    pg.on('pageerror', lambda e: errors.append(f'{name}: {e}'))
    pg.goto(BASE + '/'); pg.wait_for_selector('#splash', state='detached', timeout=10000)
    return pg

def nickname(pg, nick, club):
    pg.click('.league-tile'); pg.click('button[data-act=nick-new]'); pg.fill('#nick-in', nick)
    pg.click(f'.club-opt:has-text("{club}")'); pg.click('button[type=submit]')
    pg.wait_for_selector('.rec-code'); code = pg.inner_text('.rec-code').strip(); pg.click('text=I’ve saved it')
    pg.wait_for_selector('[data-act=nl-open]'); return code

def play_daily(pg, who, miss_at=(2,)):
    pg.click('[data-act=home]'); pg.wait_for_selector('.daily-main'); pg.click('.daily-main'); pg.wait_for_selector('.match .team >> visible=true')
    m = pg.evaluate(MATCH_JS); answers = plan(m)
    print(f'  {who} Daily: {m["h"]} {m["score"][0]}-{m["score"][1]} {m["a"]}')
    expected = 0; pts = {'scorer': 60, 'scoreline': 50, 'assist': 40, 'lineup': 20, 'booked': 25}
    for dart in range(6):
        if dart in miss_at:
            throw(pg, 'lineup', 'Lionel Messi'); continue          # a deliberate miss
        cat, ans = answers.pop(0)
        r = throw(pg, cat, ans)
        if '🎯' in r: expected += pts[cat] if cat != 'booked' else (50 if 'red' in r.lower() else 25)
    for _ in range(3):
        if pg.is_visible('text=Daily Match #') and pg.is_visible('.big-score'): break
        if pg.locator('[data-act=endvisit]').count(): pg.click('[data-act=endvisit]')
        pg.wait_for_timeout(500)
    pg.wait_for_selector('#modal .big-score', timeout=8000)
    got = int(pg.inner_text('#modal .big-score').strip())
    return got, expected

def won(pg):
    return pg.locator('#modal:not([hidden]) [data-act=nextleg]').count() > 0

def play_x01(pg, matches=None, misses=0):
    """Solo checkout from 101. Returns darts used."""
    darts = 0
    for visit in range(12):
        pg.wait_for_selector('.match .team >> visible=true')
        m = pg.evaluate(MATCH_JS)
        if matches is not None: matches.append(m['id'])
        answers = plan(m)
        for _ in range(3):
            if not answers or pg.locator('form[data-form=throw]').count() == 0: break
            if misses: throw(pg, 'lineup', 'Lionel Messi'); misses -= 1; darts += 1; continue
            cat, ans = answers.pop(0); throw(pg, cat, ans); darts += 1
            pg.wait_for_timeout(700)
            if won(pg): return darts
        if won(pg): return darts
        if pg.locator('[data-act=endvisit]').count(): pg.click('[data-act=endvisit]'); pg.wait_for_timeout(500)
    return darts

with sync_playwright() as p:
    br = p.chromium.launch()
    t = str(int(time.time() * 10) % 10000)
    A = phone(br, 'A'); B = phone(br, 'B')
    code_a = nickname(A, f'Bullseye{t}', 'Chelsea'); code_b = nickname(B, f'TopBins{t}', 'Arsenal')

    # A starts a full season, B joins with the code, A kicks off
    A.click('[data-act=nl-open]'); A.fill('#nl-name', f'Playtest Lads {t}'); A.click('.fmt[data-v=full]')
    A.click('form[data-form=create-league] button[type=submit]'); A.wait_for_selector('.lg-code b')
    lg = A.inner_text('.lg-code b').strip()
    B.click('[data-act=join-open]'); B.fill('#join-code', lg); B.click('form[data-form=join-league] button[type=submit]'); B.wait_for_selector('.lg-status')
    A.click('[data-act=leagues-home]'); A.wait_for_selector('.league-row'); A.click('.league-row')
    A.wait_for_selector('text=Kick off now'); A.click('text=Kick off now'); A.click('[data-act=lg-kickoff-yes]'); A.wait_for_selector('.gw-nav')
    check('Gameweek 1 of 2' in A.inner_text('.lg-status'), 'full season with 2 players: gameweek 1 of 2')

    # both play today's Daily Match for real
    ga, ea = play_daily(A, 'A', miss_at=(2,)); A.screenshot(path=f'{SHOTS}/p1-daily-a.png')
    check(ga == ea, f'A Daily score adds up: {ga} (expected {ea})')
    check('league' in A.inner_text('#modal').lower(), 'Daily result links to the league tables')
    gb, eb = play_daily(B, 'B', miss_at=(0, 1, 5))
    check(gb == eb, f'B Daily score adds up: {gb} (expected {eb})')
    check(ga > gb, f'A outscored B in the Daily ({ga} v {gb})')
    B.click('[data-act=daily-close]')

    # league page shows the fixture with both Daily scores
    A.click('[data-act=leagues]'); A.wait_for_selector('.league-row'); A.click('.league-row'); A.wait_for_selector('.lg-status .fx')
    lines = [x.strip() for x in A.locator('.lg-status .fx-pts').all_inner_texts()]
    check(lines[0].startswith(str(ga)) and lines[1].startswith(str(gb)), f'fixture card shows Daily points: me {lines[0]} v {lines[1]}')
    A.screenshot(path=f'{SHOTS}/p2-fixture.png')

    # A plays The Classic from 101 and challenges B
    A.click('.brand'); A.wait_for_selector('.game-card[data-v=x01]'); A.click('.game-card[data-v=x01]')
    A.wait_for_selector('[data-act=begin]'); A.click('[data-act=count][data-v="1"]'); A.click('[data-act=start][data-v="101"]'); A.click('[data-act=begin]')
    played = []
    da = play_x01(A, played)
    A.wait_for_selector('#modal .share-btn'); A.wait_for_timeout(1200)   # the challenge code is made in the background
    check('wins the leg' in A.inner_text('#modal') or 'Checked out' in A.inner_text('#modal'), f'A checked out from 101 in {da} darts')
    A.click('#modal .share-btn'); A.wait_for_timeout(500)
    shared = A.evaluate('window.__shared') or {}
    text = shared.get('text', '') + ' ' + shared.get('url', '')
    link = next((w for w in text.split() if 'vs=' in w), '')
    check('&c=' in link and f'Bullseye{t}' in link, 'challenge link carries a challenge code and the nickname')
    A.screenshot(path=f'{SHOTS}/p3-x01-won.png')

    # B plays the same matches from the link
    B.goto(link.replace('https://topflight501.com', BASE)); B.wait_for_selector('#splash', state='detached', timeout=10000)
    B.wait_for_selector('text=challenges you'); check('Playing as' in B.inner_text('#modal'), 'B sees the challenge with their nickname')
    B.click('[data-act=vs-accept]')
    bmatches = []
    db = play_x01(B, bmatches, misses=1)
    check(bmatches == played[:len(bmatches)], 'B got exactly the same matches as A')
    B.wait_for_selector('[data-vs-saved]'); B.wait_for_timeout(1500)
    saved = B.inner_text('[data-vs-saved]')
    check('Saved to your head-to-head' in saved, f'result saved for B ({db} darts v {da})')
    B.screenshot(path=f'{SHOTS}/p4-challenge-result.png')

    # the league's Challenges tab shows it
    A.click('[data-act=newgame]') if A.locator('[data-act=newgame]').count() else None
    A.goto(BASE + '/?join=' + lg); A.wait_for_selector('.lg-tabs'); A.click('.lg-tabs [data-v=chal]'); A.wait_for_selector('.results')
    res = A.inner_text('.results')
    check(f'{da} v {db}' in res and db > da, f'Challenges tab shows "{da} v {db}", A won (fewer darts)')
    A.click('.lg-tabs [data-v=chal]')
    h = A.locator('.lg-table tbody tr').first.inner_text()
    check(f'Bullseye' in h and '\t1\t1\t0\t0' in h.replace(' ', '\t'), f'A tops the challenges table with a win: {h!r}')
    A.screenshot(path=f'{SHOTS}/p5-challenges.png')

    # the week ends: A's higher Daily score wins the fixture, 3 points
    import urllib.request
    req = urllib.request.Request(BASE + '/__dev/clock', data=json.dumps({'days': 7}).encode(), headers={'content-type': 'application/json'}, method='POST')
    urllib.request.urlopen(req)
    A.goto(BASE + '/?join=' + lg); A.wait_for_selector('.lg-tabs'); A.click('.lg-tabs [data-v=table]'); A.wait_for_selector('.lg-table')
    rows = A.locator('.lg-table tbody tr').all_inner_texts()
    check(f'Bullseye{t}' in rows[0] and rows[0].strip().endswith('3'), f'after gameweek 1, A top on 3 points: {rows[0]!r}')
    check(rows[1].strip().endswith('0'), f'B on 0: {rows[1]!r}')
    check('Gameweek 2 of 2' in A.inner_text('.lg-status'), 'now in gameweek 2')
    A.screenshot(path=f'{SHOTS}/p5b-table.png')
    urllib.request.urlopen(urllib.request.Request(BASE + '/__dev/clock', data=json.dumps({'reset': True}).encode(), headers={'content-type': 'application/json'}, method='POST'))

    # supporters' table counts both Dailies
    A.click('[data-act=leagues-home]'); A.wait_for_selector('.sup-card'); A.click('.sup-card'); A.wait_for_selector('.lg-range'); A.wait_for_timeout(800)
    A.click('.lg-tabs [data-v=fans]'); A.wait_for_timeout(800)
    check(f'Bullseye{t}' in A.inner_text('#app') and str(ga) in A.inner_text('#app'), 'Chelsea fans table shows A and their Daily points')
    A.screenshot(path=f'{SHOTS}/p6-fans.png')
    br.close()

print('\nDarts thrown:'); print('\n'.join('  ' + l for l in log))
print('\nPage errors:' if errors else '\nNo page errors', *errors, sep='\n  ')
print(f'{len(fails)} FAILED' if fails else 'All playtests passed')
sys.exit(1 if fails or errors else 0)
