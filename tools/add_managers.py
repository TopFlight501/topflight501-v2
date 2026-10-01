import json, glob, datetime, collections, os
HERE = os.path.dirname(os.path.abspath(__file__))
rows=[]
for line in open(os.path.join(HERE, 'managers_wikipedia.tsv'), encoding='utf-8'):
    c=line.rstrip('\n').split('\t')
    f=datetime.datetime.strptime(c[3],'%d %B %Y').date()
    u=datetime.date(2100,1,1) if c[4]=='Present' else datetime.datetime.strptime(c[4],'%d %B %Y').date()
    rows.append(dict(care=c[0]=='C', name=c[1], club=c[2], f=f, u=u))
def mgr(club, d):
    c=[r for r in rows if r['club']==club and r['f']<=d<=r['u']]
    if len(c)>1:
        # outgoing manager takes charge on handover day
        c=sorted(c, key=lambda r: (r['u']!=d, r['f']))
    return c[0]['name'] if c else None
miss=collections.Counter()
for fn in sorted(glob.glob(os.path.join(HERE, '..', 'public', 'data', '2*.json'))):
    D=json.load(open(fn, encoding='utf-8'))
    for m in D['matches']:
        d=datetime.date.fromisoformat(m['d'])
        m['m']=[mgr(m['h'],d), mgr(m['a'],d)]
        for t,x in zip((m['h'],m['a']),m['m']):
            if not x: miss[(D['season'],t)]+=1
    json.dump(D, open(fn,'w',encoding='utf-8'), ensure_ascii=False, separators=(',',':'))
print('missing:', dict(miss))
