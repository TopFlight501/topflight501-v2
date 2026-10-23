// Tests for the name filter. Run from the repo root:  node tools/test_names.mjs
import { checkName, findRude, nameKey } from '../lib/names.js';
import LISTS from '../lib/name-lists.js';
import fs from 'node:fs';

let fails = 0;
const expect = (name, ok, kind = 'nick') => {
  const r = checkName(name, kind);
  if (r.ok !== ok) { fails++; console.log(`${ok ? 'WRONGLY BLOCKED' : 'MISSED'}: ${JSON.stringify(name)} (${kind})${r.ok ? '' : ` → ${r.why}, found "${findRude(name)}"`}`); }
};

// ---- must be blocked ----
[
  'fuck', 'FUCK', 'f.u.c.k', 'f u c k', 'phuk', 'fuk', 'fuq', 'fcuk', 'F*CK', 'fuuuuck', 'fvck', 'BigFuckingKev', 'motherfucker',
  'shit', 'sh1t', 'sh1iiit', 'shiiiit', '$hit', 'sh!t', 'shitebag', 'Gobshite', 'bullshit',
  'cunt', 'c.u.n.t', 'kunt', 'Cuntface', 'cvnt',
  'twat', 'tw4t', 'wanker', 'w4nk3r', 'Wankstain', 'bollocks', 'bollix', 'arse', 'arsehole', 'Arsewipe', 'a55hole', 'dickhead', 'D1ckhead',
  'BigDick', 'bigdickkev', 'cocksucker', 'pissflaps', 'p1ss', 'slut', 'whore', 'h0e', 'bitch', 'b1tch', 'son of a bitch',
  'BigAssKev', 'Big Ass', 'ass', 'a$$', 'asshole', 'anal', 'tits', 'titty fan', 'boobs', 'porn', 'pr0n',
  'nigger', 'n1gger', 'nigga', 'niggaz', 'faggot', 'fag', 'f4g', 'paki', 'spic', 'kike', 'coon', 'yid', 'Yid Army', 'pikey', 'retard', 'tranny',
  'nonce', 'paedo', 'rapist', 'hitler', 'nazi', '1488', 'Heil',
  // other languages
  'puta', 'Hijo de puta', 'hijoputa', 'gilipollas', 'cabron', 'cabrón', 'coño', 'pendejo', 'chinga tu madre', 'verga',
  'merde', 'putain', 'salope', 'connard', 'encule', 'nique ta mere',
  'scheisse', 'scheiße', 'arschloch', 'wichser', 'fotze', 'hurensohn',
  'cazzo', 'vaffanculo', 'stronzo', 'minchia', 'troia',
  'caralho', 'porra', 'foda-se', 'filho da puta',
  'kurwa', 'kurva', 'jebać', 'chuj', 'pierdole',
  'kanker', 'klootzak', 'kut', 'godverdomme',
  'perkele', 'vittu', 'jävla', 'fitta', 'faen', 'knulle',
  'orospu', 'siktir', 'amk',
  'pizda', 'blyat', 'suka', 'nahui', 'mudak',
  'jebem', 'kurac', 'pička', 'pula', 'muie', 'malaka', 'qifsha',
  'sharmouta', 'kosomak', 'chutiya', 'madarchod', 'behenchod', 'bhosdike', 'gandu', 'randi',
  'kontol', 'ngentot', 'putangina',
  // Irish
  'pog mo thoin', 'póg mo thóin', 'feck', 'fecker', 'gowl', 'hoor', 'shite',
  // football abuse
  'munich58', 'Munich 58', 'hillsborough', 'Heysel', 'bindipper', 'sheepshagger', 'rentboy',
  // pretending to be us
  'admin', 'Top Flight 501', 'TopFlight501', 'moderator',
].forEach(n => expect(n, false));

// look-alike letters from other alphabets
expect('fuсk', false);                       // Cyrillic с
expect('Kev 😀', false);                     // emoji
expect('Тони', false);                       // Cyrillic
// emails, links, phones, real names
expect('kev@gmail.com', false);
expect('www.kev.ie', false);
expect('0871234567', false);
expect('Sean Murphy', false);
expect('aoife kelly', false);
expect('Big Kev', true);
expect('Sean the Legend', true);

// ---- must pass ----
[
  'Big Kev', 'BullseyeBarry', 'TopBins', 'ClaretKev', 'GoldenBoot', 'Arsenal Fan', 'ArsenalFan', 'Gooner4Life', 'Scunthorpe',
  'Hancock', 'Peacock', 'Cockburn', 'Dickson', 'Penistone', 'Classic', 'Assist King', 'Bass', 'Grass', 'Passion', 'Massive',
  'Sussex Lad', 'Essex Boy', 'Cumbria', 'Titan', 'Title Race', 'Competition', 'Spoon', 'Specialist', 'Analyst', 'Canal St',
  'Shelley', 'Hello', 'Georgy', 'Butterfield', 'Sniggering', 'Niggle', 'Therapist', 'Grapes', 'Shiitake', 'Mishit',
  'Paddy', 'Mick', 'Fan Club', 'Killer Queen', 'Psycho Pearce', 'Tinkerman', 'Psychedelic', 'Monkey Magic' /* blocked: racist abuse risk */,
  'Kev_501', "O'Brien Fan", 'Seán Óg', 'Dún Laoghaire', 'Ćorluka', 'Łukasz', 'Ødegaard', 'Müller', 'Ægir',
  'The Gaffer', 'Gaffer', 'Super Sub', 'Tekkers', 'Bins', 'Worldie', 'Screamer', 'Top Corner', 'Clean Sheet', 'Hat-trick Hero',
  'Moss Side', 'Cassidy', 'Tyrone', 'Mrs Brown', 'Bassett', 'Hassan', 'Assad', 'Lassie', 'Kassel', 'Picasso',
  'Shilton', 'Sheringham', 'Shearer', 'Kuyt', 'Cucurella', 'Pukki', 'Kuszczak', 'Grealish', 'Dickov', 'Cocu',
  'Hasselbaink', 'Bassong', 'Tittmuss', 'Arsene', 'Matip', 'Nkunku', 'Firmino', 'Fucks Sake',
].forEach(n => expect(n, !['Monkey Magic', 'Fucks Sake'].includes(n)));

// league names
[
  ['Friday night lads', true], ['The Local XI', true], ["Brady's & Co", true], ['Office League 2026!', true], ['Spurs Suck', false],
  ['Shite Lads', false], ['Cunts United', false], ['Puta Madre FC', false], ['Kev 😀 league', false],
].forEach(([n, ok]) => expect(n, ok, 'league'));

// every footballer, club and manager name should get through (nicknames like "Kevin De Bruyne" are fine)
let footBad = 0;
const seen = new Set();
for (const f of fs.readdirSync('public/data').filter(f => /^20/.test(f))) {
  const d = JSON.parse(fs.readFileSync('public/data/' + f, 'utf8'));
  const names = [...Object.values(d.players).flat(), ...d.matches.flatMap(m => [m.h, m.a, ...(m.m || [])])];
  for (const n of names) {
    if (!n || seen.has(n)) continue;
    seen.add(n);
    const hit = findRude(n);
    if (hit) { footBad++; if (footBad <= 30) console.log(`FOOTBALL NAME BLOCKED: ${n} → ${hit}`); }
  }
}
console.log(`${seen.size} football names checked, ${footBad} blocked`);

// same nickname, different spelling
const same = (a, b) => { if (nameKey(a) !== nameKey(b)) { fails++; console.log(`NOT SAME: ${a} / ${b}`); } };
same('Big Kev', 'bigkev'); same('BIG KEV', 'Big  Kev'); same('Séan', 'Sean');

console.log(fails ? `${fails} problems` : 'All name tests passed', `(${LISTS.sub.length + LISTS.tok.length} blocked words)`);
process.exitCode = fails || footBad ? 1 : 0;
