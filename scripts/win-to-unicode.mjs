// Converts Burmese text typed with a Win Innwa-style legacy font into real Unicode Burmese.
// Legacy fonts store visual glyph order (ေ and ြ typed before the consonant, kinzi after it);
// Unicode wants logical order, so after mapping characters we reorder each syllable.

const KINZI = '\uE000'; // placeholder: kinzi typed after its consonant
const KINZI_I = '\uE001'; // placeholder: kinzi + ိ in one glyph

const MAP = {
  // consonants (½ is a short form of ရ)
  u: 'က', c: 'ခ', '*': 'ဂ', C: 'ဃ', i: 'င', p: 'စ', q: 'ဆ', Z: 'ဇ', n: 'ည', '#': 'ဋ', X: 'ဌ',
  P: 'ဏ', w: 'တ', x: 'ထ', "'": 'ဒ', '"': 'ဓ', e: 'န', E: 'န', y: 'ပ', z: 'ဖ', A: 'ဗ',
  b: 'ဘ', r: 'မ', ',': 'ယ', '&': 'ရ', '½': 'ရ', v: 'လ', '0': 'ဝ', o: 'သ', '[': 'ဟ', V: 'ဠ',
  t: 'အ', O: 'ဉ', 'Ó': 'ဉာ', '{': 'ဧ', 'þ': 'ဤ', 'ó': 'ဿ', '@': 'ဏ္ဍ',
  // medials (j M N B are width variants of ya-yit; < > are ya-yit + wa-hswe)
  s: 'ျ', j: 'ြ', M: 'ြ', N: 'ြ', B: 'ြ', '<': 'ြွ', '>': 'ြွ', G: 'ွ', R: 'ျွ',
  S: 'ှ', '§': 'ှ', Q: 'ျှ', T: 'ွှ', W: 'ွှ', I: 'ှု',
  // vowels and tone marks
  m: 'ာ', g: 'ါ', d: 'ိ', D: 'ီ', k: 'ု', K: 'ု', l: 'ူ', L: 'ူ', a: 'ေ', J: 'ဲ',
  H: 'ံ', f: '်', h: '့', Y: '့', U: '့', ';': 'း', F: KINZI, 'Ø': KINZI_I,
  // stacked consonants
  'ú': '္က', '©': '္ခ', '¾': '္ဂ', 'ö': '္စ', 'Æ': '္ဆ', '²': '္ဌ', 'Ö': '္ဏ',
  'å': '္တ', 'Å': '္တ', '´': '္ဒ', '¨': '္ဓ', 'Ü': '္ပ', 'Ç': '္ဘ', '®': '္မ', '’': '္လ',
  // punctuation, symbols and digits
  '?': '၊', '/': '။', '\\': '၏', 'ü': '၌', 'í': '၍', '^': ' ', '\v': '\n',
  1: '၁', 2: '၂', 3: '၃', 4: '၄', 5: '၅', 6: '၆', 7: '၇', 8: '၈', 9: '၉',
};

const CONS = '[\u1000-\u102A\u103F]';
const MEDIALS = '[\u103B-\u103E]*';
// Storage order for the marks that follow a consonant (Unicode Technical Note #11).
const RANK = { '\u103B': 1, '\u103C': 2, '\u103D': 3, '\u103E': 4, '\u1031': 5, '\u102D': 6, '\u102E': 6,
  '\u1032': 6, '\u102F': 7, '\u1030': 7, '\u102B': 8, '\u102C': 8, '\u1036': 9, '\u1037': 10,
  '\u103A': 11, '\u1038': 12 };

// Text inside `backticks` (e.g. an English line) is left as-is; the backticks are removed.
export function winToUnicode(text) {
  return text.split('`').map((part, i) => (i % 2 ? part : convert(part))).join('');
}

function convert(text) {
  // ® after မြ is a stray glyph in words like မြောက်, not a stacked မ.
  let s = text.replace(/jr\u00AE/g, 'jr');
  s = [...s].map((ch) => MAP[ch] ?? ch).join('');

  // ြ (optionally with ွ) and ေ are typed before the consonant; move them after it.
  s = s.replace(new RegExp(`\u103C(\u103D?)(${CONS})`, 'g'), '$2\u103C$1');
  s = s.replace(new RegExp(`\u1031(${CONS}(?:\u1039${CONS})?${MEDIALS})`, 'g'), '$1\u1031');

  // Kinzi (င်္) is typed after its consonant; it belongs before it.
  s = s.replace(new RegExp(`(${CONS}${MEDIALS}\u1031?)${KINZI}`, 'g'), '\u1004\u103A\u1039$1');
  s = s.replace(new RegExp(`(${CONS}${MEDIALS}\u1031?)${KINZI_I}`, 'g'), '\u1004\u103A\u1039$1\u102D');

  // Sort the marks after each consonant into Unicode storage order.
  s = s.replace(/[\u102B-\u1038\u103A-\u103E]+/g, (marks) =>
    [...marks].sort((a, b) => (RANK[a] ?? 99) - (RANK[b] ?? 99)).join(''));

  // ကျွန်ုပ်: here the asat belongs before the u vowel.
  return s.replace(/\u1014\u102F\u103A/g, '\u1014\u103A\u102F');
}
