# Top Flight 501

Premier League trivia played like darts. Every match, scorer, assist, card, player and manager comes from a checked database built into the site, so nothing is fetched or guessed during a game.

## What's in here

| Folder | What it is |
|---|---|
| `public/` | The website itself. This is all Render serves. |
| `public/data/` | The match database: one file per season, 2016/17 to 2025/26 (3,799 matches). |
| `public/js/answers.js` | Points values and spelling-tolerant answer checking. Change the points here. |
| `public/js/app.js` | The games (501 Checkout, Killer, Round the Grounds, Sudden Death), setup, settings, answer key. |
| `public/js/sound.js` | Sound effects (generated in the browser, no audio files). |
| `tools/` | Scripts that rebuild the database (only needed when adding a new season). |
| `render.yaml` | Tells Render to host `public/` as a static site. |

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

## Adding a new season later

1. `git clone https://github.com/vaastav/Fantasy-Premier-League` (it updates through each season).
2. Run `FPL_DATA=path/to/Fantasy-Premier-League/data python tools/build_data.py`.
3. Add any new manager spells to `tools/managers_wikipedia.tsv`, then run `python tools/add_managers.py`.
