// Converts Burmese text typed with a Win Innwa-style legacy font into real Unicode Burmese.
// Legacy fonts store visual glyph order (ေ and ြ typed before the consonant); Unicode wants
// the consonant first, so after mapping characters we reorder each syllable.

const MAP = {
  // consonants
  u: 'က', c: 'ခ', '*': 'ဂ', C: 'ဃ', i: 'င', p: 'စ', q: 'ဆ', Z: 'ဇ', n: 'ည',
  w: 'တ', x: 'ထ', "'": 'ဒ', '"': 'ဓ', e: 'န', E: 'န', y: 'ပ', z: 'ဖ', A: 'ဗ',
  b: 'ဘ', r: 'မ', ',': 'ယ', '&': 'ရ', v: 'လ', '0': 'ဝ', o: 'သ', '[': 'ဟ', V: 'ဠ', t: 'အ',
  // medials (j M N B are width variants of ya-yit)
  s: 'ျ', j: 'ြ', M: 'ြ', N: 'ြ', B: 'ြ', G: 'ွ', R: 'ျွ', S: 'ှ', W: 'ွှ',
  // vowels and tone marks
  m: 'ာ', g: 'ါ', d: 'ိ', D: 'ီ', k: 'ု', K: 'ု', l: 'ူ', L: 'ူ', a: 'ေ', J: 'ဲ',
  H: 'ံ', f: '်', h: '့', Y: '့', ';': 'း',
  // stacked consonants
  'å': '္တ', 'ö': '္စ',
  // punctuation, symbols and digits
  '?': '၊', '/': '။', '\\': '၏', 'ü': '၌',
  1: '၁', 2: '၂', 3: '၃', 4: '၄', 5: '၅', 6: '၆', 7: '၇', 8: '၈', 9: '၉',
};

const CONS = '[က-အ]';
// Storage order for the marks that follow a consonant (Unicode Technical Note #11).
const RANK = { 'ျ': 1, 'ြ': 2, 'ွ': 3, 'ှ': 4, 'ေ': 5, 'ိ': 6, 'ီ': 6,
  'ဲ': 6, 'ု': 7, 'ူ': 7, 'ါ': 8, 'ာ': 8, 'ံ': 9, '့': 10,
  '်': 11, 'း': 12 };

export function winToUnicode(text) {
  let s = [...text].map((ch) => MAP[ch] ?? ch).join('');

  // ြ and ေ are typed before the consonant; move them after it (and any stacked consonant).
  s = s.replace(new RegExp(`ြ(${CONS})`, 'g'), '$1ြ');
  s = s.replace(new RegExp(`ေ(${CONS}(?:္${CONS})?[ျ-ှ]*)`, 'g'), '$1ေ');

  // Sort the marks after each consonant into Unicode storage order.
  s = s.replace(/[ါ-း်-ှ]+/g, (marks) =>
    [...marks].sort((a, b) => (RANK[a] ?? 99) - (RANK[b] ?? 99)).join(''));

  // ကျွန်ုပ်: here the asat belongs before the u vowel.
  return s.replace(/နု်/g, 'န်ု');
}
