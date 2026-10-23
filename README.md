# Top Flight 501

Premier League trivia played like darts. Every match, scorer, assist, card, player and manager comes from a checked database built into the site, so nothing is fetched or guessed during a game.

## What's in here

| Folder | What it is |
|---|---|
| `public/` | The website itself. This is what Cloudflare Pages serves. |
| `public/data/` | The match database: one file per season, 2016/17 to 2025/26 (3,799 matches). |
| `public/js/answers.js` | Points values and spelling-tolerant answer checking. Change the points here. |
| `public/js/app.js` | The games (501 Checkout, Killer, Round the Grounds, Sudden Death, Sent Off), setup, settings, answer key. |
| `public/js/analytics.js` | Anonymous, cookie-free visit and game counting with Umami (dashboard at cloud.umami.is). |
| `public/js/sound.js` | Sound effects (generated in the browser, no audio files). |
| `tools/` | Scripts that rebuild the database (only needed when adding a new season). |
| `functions/api/daily.js` | The Daily Match leaderboard (a Cloudflare Pages Function, scores kept in Cloudflare KV). |
| `functions/api/me.js`, `leagues.js`, `scores.js`, `challenges.js`, `report.js` | Online leagues: nicknames, recovery codes, league tables, Daily scores and challenge results (Cloudflare D1 database, binding `DB`). |
| `functions/api/admin.js`, `public/admin.html` | Admin page for reported names. Needs the `ADMIN_KEY` secret in Cloudflare. |
| `lib/server.js` | Shared server code: database tables (created automatically), codes, deleting a player. |
| `lib/names.js`, `lib/name-lists.js` | The nickname and league-name filter. Rebuild the lists with `python tools/build_names.py`. |
| `public/js/online.js` | The site's side of online leagues (talks to `/api`, remembers the nickname on the phone). |
| `public/_headers` | Caching rules for Cloudflare Pages. |
| `public/_redirects` | Short share links (topflight501.com/x, /tt, /ig) that add a tracking tag for Umami. |

## Where the data comes from

- **Matches, scorers, assists, cards, who played**: official Fantasy Premier League records, archived at github.com/vaastav/Fantasy-Premier-League. Every match is checked so the goals add up to the final score and both teams have at least 11 players, or it's left out.
- **Managers (including caretakers)**: Wikipedia's *List of Premier League managers*, matched to each game by date (`tools/managers_wikipedia.tsv`).

"Lineup Player" accepts anyone who played (starters and subs). Own goals are stored and count as goals, listed under the team that benefited. A player can be picked once for each goal or assist they got. Assists follow the official FPL record.

## Run it on your own computer

Any static file server works, for example:

```
cd public
python -m http.server 8000
```

Then open http://localhost:8000.

## Online leagues

Optional. A player picks a nickname and a club colour and gets a recovery code (shown once; we keep only a hashed copy). Leagues have a join code (TF-K7Q2M) and an invite link (topflight501.com/j/TF-K7Q2M). Each league shows a Daily table (Daily Match points, this week and all time) and a Head-to-head table (challenge links played between members). Nothing else is stored: no emails, real names, passwords or IP addresses. Nicknames unused for 12 months are deleted automatically.

Cloudflare set-up: a D1 database bound as `DB` (Production and Preview), and a secret `ADMIN_KEY` for the admin page.

The name filter checks nicknames and league names against rude-word lists in many languages (including the [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) lists, CC BY 4.0, plus our own in `tools/wordlists/extra.txt`), undoes disguises (sh1t, f.u.c.k, phuk), refuses other alphabets and emoji, and lets every Premier League player, club and manager name through. Add words to `tools/wordlists/extra.txt` or innocent words to `allow.txt`, then run `python tools/build_names.py`.

### Testing on your own computer

```
node tools/dev-server.mjs          # the site plus the /api functions, with a local database
node tools/test_names.mjs          # name filter tests
node tools/test_api.mjs            # league API tests (needs the dev server running)
python tools/test_ui.py            # clicks through the screens in a headless browser (needs Playwright)
```

## Adding a new season later

1. `git clone https://github.com/vaastav/Fantasy-Premier-League` (it updates through each season).
2. Run `FPL_DATA=path/to/Fantasy-Premier-League/data python tools/build_data.py`.
3. Add any new manager spells to `tools/managers_wikipedia.tsv`, then run `python tools/add_managers.py`.
4. Run `python tools/build_names.py` so the new players' names can't be mistaken for rude words.
