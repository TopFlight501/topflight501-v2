"""Build Top Flight 501 match database from vaastav/Fantasy-Premier-League (official FPL data)."""
import pandas as pd, json, os, sys, unicodedata, collections
SRC = os.environ.get('FPL_DATA', '../Fantasy-Premier-League/data')
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
os.makedirs(OUT, exist_ok=True)

ALPHA = {
 '2016-17': ['Arsenal','Bournemouth','Burnley','Chelsea','Crystal Palace','Everton','Hull City','Leicester City','Liverpool','Manchester City','Manchester United','Middlesbrough','Southampton','Stoke City','Sunderland','Swansea City','Tottenham Hotspur','Watford','West Bromwich Albion','West Ham United'],
 '2017-18': ['Arsenal','Bournemouth','Brighton & Hove Albion','Burnley','Chelsea','Crystal Palace','Everton','Huddersfield Town','Leicester City','Liverpool','Manchester City','Manchester United','Newcastle United','Southampton','Stoke City','Swansea City','Tottenham Hotspur','Watford','West Bromwich Albion','West Ham United'],
 '2018-19': ['Arsenal','Bournemouth','Brighton & Hove Albion','Burnley','Cardiff City','Chelsea','Crystal Palace','Everton','Fulham','Huddersfield Town','Leicester City','Liverpool','Manchester City','Manchester United','Newcastle United','Southampton','Tottenham Hotspur','Watford','West Ham United','Wolverhampton Wanderers'],
}
FULL = {'Arsenal':'Arsenal','Aston Villa':'Aston Villa','Bournemouth':'Bournemouth','Brentford':'Brentford','Brighton':'Brighton & Hove Albion','Burnley':'Burnley','Chelsea':'Chelsea','Crystal Palace':'Crystal Palace','Everton':'Everton','Fulham':'Fulham','Leeds':'Leeds United','Leicester':'Leicester City','Liverpool':'Liverpool','Man City':'Manchester City','Man Utd':'Manchester United','Newcastle':'Newcastle United','Norwich':'Norwich City','Sheffield Utd':'Sheffield United','Southampton':'Southampton','Spurs':'Tottenham Hotspur','Watford':'Watford','West Brom':'West Bromwich Albion','West Ham':'West Ham United','Wolves':'Wolverhampton Wanderers','Luton':'Luton Town',"Nott'm Forest":'Nottingham Forest','Ipswich':'Ipswich Town','Sunderland':'Sunderland','Hull':'Hull City','Cardiff':'Cardiff City','Huddersfield':'Huddersfield Town'}

def clean(s):
    return s if isinstance(s,str) else ''

report = {}
for season in sorted(os.listdir(SRC)):
    if season >= '2026-27': continue
    d = f'{SRC}/{season}'
    gw = pd.read_csv(f'{d}/gws/merged_gw.csv', encoding='latin-1', on_bad_lines='skip', low_memory=False)
    try: pr = pd.read_csv(f'{d}/players_raw.csv', encoding='utf-8')
    except UnicodeDecodeError: pr = pd.read_csv(f'{d}/players_raw.csv', encoding='latin-1')
    if os.path.exists(f'{d}/teams.csv'):
        tm = pd.read_csv(f'{d}/teams.csv'); teams = {int(r.id): FULL.get(r['name'], r['name']) for _, r in tm.iterrows()}
    else:
        teams = {i+1: n for i, n in enumerate(ALPHA[season])}
    players = {int(r.id): (f"{clean(r.first_name)} {clean(r.second_name)}".strip(), clean(r.web_name)) for _, r in pr.iterrows()}
    gw = gw.drop_duplicates(subset=['element','fixture'])
    gw['was_home'] = gw['was_home'].astype(str).str.lower().isin(['true','1'])
    fx = {}
    if os.path.exists(f'{d}/fixtures.csv'):
        f = pd.read_csv(f'{d}/fixtures.csv')
        for _, r in f.iterrows():
            fx[int(r.id)] = dict(h=int(r.team_h), a=int(r.team_a), hs=r.team_h_score, as_=r.team_a_score, k=r.kickoff_time, fin=str(r.finished)=='True')
    matches = {}
    for _, r in gw.iterrows():
        fid = int(r.fixture)
        if fid in fx:
            f = fx[fid]; side = 'h' if r.was_home else 'a'
            tid = f['h'] if side=='h' else f['a']
        m = matches.setdefault(fid, dict(players={}, k=r.kickoff_time, hs=r.team_h_score, as_=r.team_a_score, home=None, away=None))
        side = 'h' if r.was_home else 'a'
        opp = teams[int(r.opponent_team)]
        if side=='h': m['away'] = opp
        else: m['home'] = opp
        m['players'][int(r.element)] = dict(side=side, min=int(r.minutes), g=int(r.goals_scored), a=int(r.assists), y=int(r.yellow_cards), r=int(r.red_cards), og=int(r.own_goals), st=(int(r['starts']) if 'starts' in r and not pd.isna(r['starts']) else None))
    out = []; bad = 0; used = {}
    for fid, m in sorted(matches.items()):
        if fid in fx:
            f = fx[fid]
            if not f['fin']: continue
            m['home'], m['away'] = teams[f['h']], teams[f['a']]; m['hs'], m['as_'] = f['hs'], f['as_']; m['k'] = f['k']
        if m['home'] is None or m['away'] is None or pd.isna(m['hs']): bad += 1; continue
        hs, as_ = int(m['hs']), int(m['as_'])
        P = [(pid, p) for pid, p in m['players'].items() if p['min'] > 0]
        gh = sum(p['g'] for _, p in P if p['side']=='h') + sum(p['og'] for _, p in P if p['side']=='a')
        ga = sum(p['g'] for _, p in P if p['side']=='a') + sum(p['og'] for _, p in P if p['side']=='h')
        nh = sum(1 for _, p in P if p['side']=='h'); na = sum(1 for _, p in P if p['side']=='a')
        ok = (gh == hs and ga == as_ and nh >= 11 and na >= 11)
        if not ok: bad += 1; continue
        rec = dict(id=f"{season}-{fid}", d=str(m['k'])[:10], h=m['home'], a=m['away'], s=[hs, as_], p=[])
        for pid, p in sorted(P, key=lambda x: (x[1]['side'], -(x[1]['st'] or (1 if x[1]['min']>=45 else 0)), -x[1]['min'])):
            full, web = players.get(pid, (str(pid), ''))
            used[pid] = (full, web)
            e = [pid, 0 if p['side']=='h' else 1, p['g'], p['a'], 2 if p['r'] else (1 if p['y'] else 0)]
            if p['st'] is not None: e.append(p['st'])
            rec['p'].append(e)
        out.append(rec)
    json.dump(dict(season=season, players={k: list(v) for k, v in used.items()}, matches=out), open(f'{OUT}/{season}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    report[season] = (len(out), bad)
    print(season, 'kept', len(out), 'rejected', bad, flush=True)
json.dump(sorted(report), open(f'{OUT}/seasons.json','w'))
