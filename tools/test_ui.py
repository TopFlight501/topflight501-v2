"""Clicks through the leagues screens in a headless phone-sized browser.
Start the local server first (node tools/dev-server.mjs), then:  python tools/test_ui.py
Screenshots go to SHOTS (default .dev/shots)."""
import json, os, sys, time, urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:8788')
SHOTS = os.environ.get('SHOTS', '.dev/shots')
os.makedirs(SHOTS, exist_ok=True)
tag = format(int(time.time() * 1000) % 1679616, 'X')[-4:]
errors, fails = [], []

def check(cond, what):
    print(('ok   ' if cond else 'FAIL ') + what)
    if not cond: fails.append(what)

def api(path, body=None, key=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body else None,
                                 headers={'content-type': 'application/json', **({'x-tf-key': key} if key else {})}, method='POST' if body else 'GET')
    with urllib.request.urlopen(req) as r: return json.loads(r.read())

def phone(browser, name):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'{name}: {e}'))
    page.on('console', lambda m: m.type == 'error' and errors.append(f'{name} console: {m.text}'))
    return ctx, page

def shot(page, name, full=True):
    page.screenshot(path=f'{SHOTS}/{name}.png', full_page=full)

def ready(page, url='/'):
    page.goto(BASE + url)
    page.wait_for_selector('#splash', state='detached', timeout=8000)

with sync_playwright() as p:
    br = p.chromium.launch()
    a_ctx, a = phone(br, 'A')
    ready(a)
    check(a.locator('.league-card').count() == 1, 'Leagues card on the home screen')
    a.click('.league-card')
    check('Play your mates in a league' in a.inner_text('#app'), 'intro screen without a nickname')
    shot(a, '01-intro')
    a.click('button[data-act=nick-new]')
    a.fill('#nick-in', 'sh1te lad')
    a.click('button[type=submit]')
    a.wait_for_selector('[data-nick-err]:not([hidden])')
    check('isn’t allowed' in a.inner_text('[data-nick-err]'), 'rude nickname refused on screen')
    a.fill('#nick-in', f'Barry_{tag}')
    a.click('.club-opt:has-text("Chelsea")')
    check(a.input_value('#nick-in') == f'Barry_{tag}', 'typed nickname kept after picking a colour')
    shot(a, '02-nickname', full=False)
    a.click('button[type=submit]')
    a.wait_for_selector('.rec-code')
    code_a = a.inner_text('.rec-code').strip()
    check(len(code_a) == 14, f'recovery code shown ({code_a})')
    shot(a, '03-code', full=False)
    a.click('text=I’ve saved it')
    a.wait_for_selector('text=Your leagues')
    a.wait_for_selector('[data-act=nl-open]'); a.click('[data-act=nl-open]')
    a.click('form[data-form=create-league] button[type=submit]')
    a.wait_for_selector('[data-nick-err]:not([hidden])')
    check('name first' in a.inner_text('[data-nick-err]'), 'empty league name explained')
    a.fill('#nl-name', f'Friday Lads {tag}')
    a.click('.fmt[data-v=sprint]'); a.click('.fmt-weeks [data-v="4"]')
    check(a.input_value('#nl-name') == f'Friday Lads {tag}' and a.locator('.fmt.on[data-v=sprint]').count() == 1, 'format picked, name kept')
    shot(a, '02b-create', full=False)
    a.click('.fmt[data-v=open]')
    a.click('form[data-form=create-league] button[type=submit]')
    a.wait_for_selector('.lg-code b')
    lg = a.inner_text('.lg-code b').strip()
    check(lg.startswith('TF-'), f'league created ({lg})')

    # second phone joins with the invite link
    b_ctx, b = phone(br, 'B')
    ready(b, f'/j/{lg}')
    b.wait_for_selector('text=Join Friday Lads')
    shot(b, '04-invite', full=False)
    b.click('text=Pick a nickname and join')
    b.fill('#nick-in', f'TopBins_{tag}')
    b.click('.club-opt:has-text("Arsenal")')
    b.click('button[type=submit]')
    b.wait_for_selector('.rec-code')
    code_b = b.inner_text('.rec-code').strip()
    b.click('text=I’ve saved it')
    b.wait_for_selector('.lg-code b')
    check(b.locator('.lg-members li').count() == 2, 'joined from the invite link')

    # third player via the code box, no club
    c_ctx, c = phone(br, 'C')
    ready(c)
    c.click('.league-card'); c.click('button[data-act=nick-new]')
    c.fill('#nick-in', f'Claret_{tag}'); c.click('.club-opt:has-text("Burnley")'); c.click('button[type=submit]')
    c.wait_for_selector('.rec-code'); code_c = c.inner_text('.rec-code').strip(); c.click('text=I’ve saved it')
    c.wait_for_selector('[data-act=join-open]'); c.click('[data-act=join-open]'); c.wait_for_selector('#join-code')
    c.fill('#join-code', 'tf zzzzz'); c.click('form[data-form=join-league] button[type=submit]')
    c.wait_for_selector('[data-nick-err]:not([hidden])'); check('No league has that code' in c.inner_text('[data-nick-err]'), 'wrong join code explained')
    c.fill('#join-code', lg.lower().replace('-', ' ')); c.click('form[data-form=join-league] button[type=submit]')
    c.wait_for_selector('.lg-code b')
    check(c.locator('.lg-members li').count() == 3, 'joined by typing the code')

    # scores and a challenge, sent the way the game sends them
    day = api('/api/me', key=code_a)['day']
    api('/api/scores', {'n': day, 'p': 185}, code_a); api('/api/scores', {'n': day, 'p': 240}, code_b); api('/api/scores', {'n': day - 1, 'p': 95}, code_c)
    ch = api('/api/challenges', {'action': 'create', 'g': 'x01', 's': 501, 'r': 21, 'm': '2324-15.1718-200'}, code_a)['id']
    api('/api/challenges', {'action': 'result', 'id': ch, 'r': 18}, code_b)
    ch2 = api('/api/challenges', {'action': 'create', 'g': 'sudden', 's': 501, 'r': 140, 'm': '2324-15'}, code_c)['id']
    api('/api/challenges', {'action': 'result', 'id': ch2, 'r': 90}, code_a)

    a.click('text=‹ Your leagues'); a.wait_for_selector('.league-row'); a.click('.league-row')
    a.wait_for_selector('.lg-table')
    rows = a.locator('.lg-table tbody tr')
    check(rows.count() == 3 and f'TopBins_{tag}' in rows.nth(0).inner_text(), 'Daily table ordered by points')
    dot = a.evaluate("getComputedStyle(document.querySelector('.lg-table tbody tr .club-dot')).backgroundImage")
    check('239, 1, 7' in dot, 'top row shows an Arsenal club badge')
    shot(a, '05-daily-table')
    a.click('text=All time')
    a.click('.lg-tabs [data-v=chal]'); a.wait_for_selector('text=Latest results')
    check(a.locator('.lg-table tbody tr').count() == 3 and '1' in a.locator('.lg-table tbody tr').nth(0).inner_text(), 'head-to-head table shown')
    shot(a, '06-h2h')

    # challenge link with a challenge code, opened by someone with a nickname
    ch3 = api('/api/challenges', {'action': 'create', 'g': 'x01', 's': 501, 'r': 21, 'm': '2324-15.1718-200'}, code_a)['id']
    ready(b, f'/?vs=x01&s=501&r=21&n=Barry_{tag}&c={ch3}&m=2324-15.1718-200')
    b.wait_for_selector('text=challenges you')
    check('Playing as' in b.inner_text('#modal') and 'head-to-head record' in b.inner_text('#modal'), 'challenge offer shows your nickname')
    shot(b, '07-challenge', full=False)
    b.click('text=Not now')

    # report, settings, then delete a nickname
    c.click('text=Report a name'); c.click(f'#modal button:has-text("Barry_{tag}")'); c.wait_for_selector('.toast')
    check('take a look' in c.inner_text('.toast'), 'report sent')
    b.click('.brand'); b.click('[data-act=settings]')
    check(f'TopBins_{tag}' in b.inner_text('#modal'), 'settings show the nickname')
    shot(b, '08-settings')
    b.click('text=Manage nickname'); b.click('text=Delete my nickname'); b.click('text=Yes, delete my nickname')
    b.wait_for_selector('.toast:has-text("Nickname deleted")')
    check(b.evaluate("localStorage.getItem('tf501:me')") is None, 'nickname removed from the phone')

    # restore on a new phone with the recovery code
    d_ctx, d = phone(br, 'D')
    ready(d); d.click('.league-card'); d.click('text=I have a recovery code')
    d.fill('#restore-in', code_c.lower()); d.click('button[type=submit]')
    d.wait_for_selector('.league-row')
    check(f'Claret_{tag}' in d.inner_text('.me-row') and d.locator('.league-row').count() == 1, 'recovery code brings nickname and leagues back')
    d.click('.league-row'); d.wait_for_selector('.lg-table')
    check(d.locator('.lg-members li').count() == 2, 'deleted player gone from the league')

    # a season league: create, invite, kick off, fixtures tab, reminder, supporters
    a.click('text=‹ Your leagues'); a.wait_for_selector('[data-act=nl-open]'); a.click('[data-act=nl-open]')
    a.fill('#nl-name', f'Season Lads {tag}'); a.click('.fmt[data-v=half]')
    a.click('form[data-form=create-league] button[type=submit]'); a.wait_for_selector('.lg-status')
    check('Kicks off' in a.inner_text('.lg-status'), 'season league waits for kick-off')
    slg = a.inner_text('.lg-code b').strip()
    api('/api/leagues', {'action': 'join', 'code': slg}, code_c)
    a.click('text=‹ Your leagues'); a.wait_for_selector(f'.league-row:has-text("Season Lads {tag}")'); a.click(f'.league-row:has-text("Season Lads {tag}")'); a.wait_for_selector('.lg-status')
    a.click('text=Kick off now'); a.click('[data-act=lg-kickoff-yes]')
    a.wait_for_selector('.gw-nav')
    check('Gameweek 1' in a.inner_text('.gw-nav') and a.locator('.fx').count() >= 1, 'kicked off: fixtures drawn')
    check('Gameweek 1 of' in a.inner_text('.lg-status'), 'this week’s fixture shown at the top')
    shot(a, '10-fixtures')
    a.click('.lg-tabs [data-v=table]'); a.wait_for_selector('.lg-table')
    check(a.locator('.lg-table tbody tr').count() == 2, 'season table lists both players')
    shot(a, '11-season-table')
    a.click('[data-act=lg-remind]'); a.wait_for_selector('.remind-btns')
    href = a.get_attribute('.remind-btns a.btn.primary', 'href')
    check('/api/remind?code=' in href or 'calendar.google.com' in href, 'gameweek reminder offered')
    a.click('#modal [data-act=close]')
    a.click('text=‹ Your leagues'); a.wait_for_selector('.sup-card'); a.click('.sup-card'); a.wait_for_selector('text=Supporters’ table')
    a.wait_for_selector('.lg-range'); a.wait_for_timeout(500)
    check('Chelsea fans' in a.inner_text('#app'), 'supporters’ table has your club’s fans tab')
    shot(a, '12-supporters')

    # dark mode look
    a.emulate_media(color_scheme='dark'); a.click('[data-act=sup-back]'); a.wait_for_selector('.league-row'); a.click('.league-row'); a.wait_for_selector('.lg-tabs'); shot(a, '09-dark')
    br.close()

print('\nPage errors:' if errors else '\nNo page errors', *errors, sep='\n  ')
print(f'{len(fails)} FAILED' if fails else 'All UI checks passed')
sys.exit(1 if fails or errors else 0)
