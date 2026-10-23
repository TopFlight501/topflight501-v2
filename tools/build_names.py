"""Builds lib/name-lists.js: the word lists the nickname and league-name filter checks against.

Run from the repo root after changing anything in tools/wordlists/ or adding a new season:
    python tools/build_names.py

Sources:
  tools/wordlists/ldnoobw-*.txt   List of Dirty, Naughty, Obscene and Otherwise Bad Words
                                  (github.com/LDNOOBW), CC BY 4.0. Latin-alphabet languages only,
                                  because names in other alphabets are refused outright.
  tools/wordlists/extra.txt       Our own additions: Irish slang, transliterated swearing, football abuse.
  tools/wordlists/allow.txt       Innocent words that contain a blocked word (Scunthorpe, Arsenal...).
  tools/wordlists/first-names.txt Common first names, for the "use a nickname, not your real name" check.
  public/data/*.json              Every club, player and manager name, added to the allow-list.
"""
import glob
import json
import os
import re
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WL = os.path.join(ROOT, 'tools', 'wordlists')

# English words short enough to sit inside innocent words, but rude enough to block anywhere.
# Each one has an allow-list escape (arsenal, hancock, dickson...).
EN_CORE = {'dick', 'cock', 'piss', 'porn', 'dildo', 'penis', 'bitch', 'nonce', 'paedo', 'clit', 'arse',
           'wank', 'twat', 'cunt', 'shit', 'fuck', 'jizz', 'slut', 'whore', 'nigg', 'fagg', 'pussy', 'skank'}
# English list words that are also everyday words or names: whole word only.
EN_TOKEN = {'escort', 'hooker', 'honkey', 'lolita', 'butt', 'suck', 'sucks', 'scat', 'snatch', 'eunuch', 'grope',
            'cialis', 'smut', 'poon', 'orgy', 'boner', 'spunk', 'skeet', 'twink', 'kinky', 'busty', 'panty', 'voyeur',
            'voyuer', 'negro', 'girl on', 'tied up', 'xx'}


def plain(s):
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    for a, b in {'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'ł': 'l', 'þ': 'th', 'ı': 'i'}.items():
        s = s.replace(a, b)
    return s


def letters(s):
    return re.sub(r'[^a-z0-9]', '', plain(s))


def latin_ok(s):
    return all(c.isascii() or unicodedata.name(c, '').startswith('LATIN') or unicodedata.combining(c) for c in unicodedata.normalize('NFKD', s))


def read(path):
    with open(path, encoding='utf-8') as f:
        return [l.strip() for l in f if l.strip() and not l.startswith('#')]


sub, tok, strong = set(), set(), set()

for path in sorted(glob.glob(os.path.join(WL, 'ldnoobw-*.txt'))):
    lang = os.path.basename(path)[8:-4]
    for w in read(path):
        if not latin_ok(w):
            continue
        p, n = plain(w), len(letters(w))
        if n < 2:
            continue
        if lang == 'en':
            if p in EN_TOKEN:
                tok.add(p)
            elif p in EN_CORE or n >= 6:
                sub.add(p)
            else:
                tok.add(p)
        else:
            (sub if n >= 7 else tok).add(p)

for w in read(os.path.join(WL, 'extra.txt')):
    p = plain(w.lstrip('=!'))
    n = len(letters(p))
    if w.startswith('!'):
        sub.add(p)
        strong.add(p)
    elif w.startswith('='):
        (sub if n >= 7 else tok).add(p)
    else:
        (sub if n >= 4 else tok).add(p)

for w in EN_CORE:
    sub.add(w)
strong |= {'fuck', 'cunt', 'shit', 'nigg', 'fagg', 'twat', 'wank', 'whore', 'slut', 'jizz'}
tok -= sub

allow = {plain(w) for w in read(os.path.join(WL, 'allow.txt'))}

# Football names: every club, player and manager, as whole names and as single words.
foot = set()
for path in glob.glob(os.path.join(ROOT, 'public', 'data', '20*.json')):
    with open(path, encoding='utf-8') as f:
        d = json.load(f)
    names = [n for pair in d['players'].values() for n in pair]
    for m in d['matches']:
        names += [m['h'], m['a']] + [x for x in m.get('m', []) if x]
    for n in names:
        if not n:
            continue
        foot.add(plain(n))
        for part in re.split(r"[\s\-']+", n):
            if len(letters(part)) >= 4:
                foot.add(plain(part))
# A short blocked word that is also a footballer's name (Butt, Pukki, Gago...) is let through,
# except slurs, which stay blocked whoever shares the spelling.
PROTECT = {'sambo', 'coon', 'paki', 'spic', 'yid', 'kike', 'wog', 'gook', 'chink', 'nonce', 'rape', 'nazi'}
foot_words = {letters(f) for f in foot}
tok = {t for t in tok if letters(t) not in foot_words or t in PROTECT}
# Everyday words in other languages' lists that are innocent in English, or are common names
SKIP = {'fan', 'del', 'frank', 'peter', 'pau', 'buur', 'kusi', 'sako', 'gago', 'pukki', 'lynch', 'malakia', 'ape', 'bum'}
tok -= SKIP
sub -= SKIP
# a footballer's name that is itself a blocked word must not become an escape route
foot = {f for f in foot if letters(f) not in {letters(b) for b in sub | tok}}

first = set()
for line in read(os.path.join(WL, 'first-names.txt')):
    first |= {plain(x) for x in line.split()}

out = {
    'sub': sorted(sub), 'tok': sorted(tok), 'strong': sorted(strong),
    'allow': sorted(allow), 'foot': sorted(foot), 'first': sorted(first),
}
dest = os.path.join(ROOT, 'lib', 'name-lists.js')
with open(dest, 'w', encoding='utf-8') as f:
    f.write('// Built by tools/build_names.py. Do not edit by hand.\n')
    f.write('// Word lists include the LDNOOBW lists (github.com/LDNOOBW), CC BY 4.0.\n')
    f.write('export default ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print({k: len(v) for k, v in out.items()}, '->', os.path.relpath(dest, ROOT))
