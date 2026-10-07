// The Bible: the Judson Burmese Bible (1840) and the King James Version, one file per book in
// bible/ (see bible/README.md). Finds passages from references like "John 3:16-18", "Ps 23" or
// "ယောဟန် ၃:၁၆", loads their text, names them in Burmese and English, and searches for words.
// In a set of songs, a passage's id is like "bible:JHN.3.16-3.18" (book, first and last chapter.verse).
(function () {
  const FOLDERS = { my: 'myajvb', en: 'kjv' };
  const DIGITS = '၀၁၂၃၄၅၆၇၈၉';
  const toLatin = (s) => String(s).replace(/[၀-၉]/g, (d) => DIGITS.indexOf(d));
  const toBurmese = (s) => String(s).replace(/\d/g, (d) => DIGITS[d]);
  const key = (s) => toLatin(s).toLowerCase().replace(/[\s.\u200b\u200c\u200d။]/g, '');
  const cache = {};
  let booksList = null;

  const books = () => (booksList ??= fetch('bible/books.json').then((r) => r.json()));
  function bookText(lang, code) {
    cache[`${lang}/${code}`] ??= fetch(`bible/${FOLDERS[lang]}/${code}.json`).then((r) => {
      if (!r.ok) throw new Error(`Couldn’t load ${code}`);
      return r.json();
    });
    return cache[`${lang}/${code}`];
  }

  // A book from a name or abbreviation, in English or Burmese ("jn", "John", "ယောဟန်", "1 Cor").
  function findBook(list, name) {
    const k = key(name);
    if (!k || !/[a-z\u1000-\u109f]/.test(k)) return null;
    return list.find((b) => b.keys.includes(k)) || list.find((b) => b.keys.some((n) => n.startsWith(k))) || null;
  }

  // "John 3:16-18", "John 3", "John 3-4", "John 3:16-4:2" -> { book, start: [chapter, verse], end: [chapter, verse] }
  async function parse(text) {
    const list = await books();
    const m = toLatin(text).trim().replace(/[：း]/g, ':').replace(/[–—]/g, '-')
      .match(/^(.+?)\s*(\d+)(?:\s*:\s*(\d+))?(?:\s*-\s*(\d+)(?:\s*:\s*(\d+))?)?$/);
    if (!m) return null;
    const book = findBook(list, m[1]);
    if (!book) return null;
    const verses = (c) => book.chapters[c - 1];
    const c1 = Number(m[2]);
    const v1 = m[3] ? Number(m[3]) : 1;
    let c2 = c1;
    let v2;
    if (!m[3]) {
      if (m[4]) c2 = Number(m[4]);
      v2 = verses(c2); // whole chapters
    } else if (m[5]) {
      c2 = Number(m[4]);
      v2 = Number(m[5]);
    } else {
      v2 = m[4] ? Number(m[4]) : v1;
    }
    if (!verses(c1) || !verses(c2) || c2 < c1 || v1 < 1 || v1 > verses(c1)) return null;
    v2 = Math.min(v2, verses(c2));
    if (c1 === c2 && v2 < v1) return null;
    return { book, start: [c1, v1], end: [c2, v2] };
  }

  const id = (ref) => `bible:${ref.book.code}.${ref.start.join('.')}-${ref.end.join('.')}`;
  async function fromId(passageId) {
    const m = String(passageId).match(/^bible:([1-3A-Z]{3})\.(\d+)\.(\d+)-(\d+)\.(\d+)$/);
    if (!m) return null;
    const book = (await books()).find((b) => b.code === m[1]);
    return book ? { book, start: [Number(m[2]), Number(m[3])], end: [Number(m[4]), Number(m[5])] } : null;
  }
  const chapter = (book, c) => ({ book, start: [c, 1], end: [c, book.chapters[c - 1]] });
  // The reference of some of a passage's verses (e.g. the ones on one slide).
  const part = (ref, verses) => ({ book: ref.book, start: [verses[0].c, verses[0].v], end: [verses[verses.length - 1].c, verses[verses.length - 1].v] });

  // "3:16-18", or "3" / "3-4" for whole chapters
  function rangeText(ref) {
    const [c1, v1] = ref.start;
    const [c2, v2] = ref.end;
    if (v1 === 1 && v2 === ref.book.chapters[c2 - 1]) return c1 === c2 ? `${c1}` : `${c1}-${c2}`;
    if (c1 !== c2) return `${c1}:${v1}-${c2}:${v2}`;
    return v1 === v2 ? `${c1}:${v1}` : `${c1}:${v1}-${v2}`;
  }
  function label(ref, lang = 'my') {
    const my = `${ref.book.my} ${toBurmese(rangeText(ref))}`;
    const en = `${ref.book.en} ${rangeText(ref)}`;
    return lang === 'en' ? en : lang === 'both' ? `${my} · ${en}` : my;
  }

  // The verses of a passage: [{ c, v, my, en }]
  async function verses(ref) {
    const [my, en] = await Promise.all([bookText('my', ref.book.code), bookText('en', ref.book.code)]);
    const out = [];
    for (let c = ref.start[0]; c <= ref.end[0]; c++) {
      const from = c === ref.start[0] ? ref.start[1] : 1;
      const to = c === ref.end[0] ? ref.end[1] : ref.book.chapters[c - 1];
      for (let v = from; v <= to; v++) out.push({ c, v, my: my[c - 1]?.[v - 1] || '', en: en[c - 1]?.[v - 1] || '' });
    }
    return out;
  }

  // A passage as an item in a set of songs (setlist.js).
  async function passage(passageId) {
    const ref = await fromId(passageId);
    if (!ref) throw new Error(`Unknown passage ${passageId}`);
    return { slug: passageId, kind: 'bible', ref, title: label(ref, 'my'), verses: await verses(ref) };
  }

  // The lines for one verse: number and text, in Burmese ("my"), English ("en") or both.
  function verseLines(verse, lang, ref) {
    const number = ref && ref.start[0] !== ref.end[0] ? `${verse.c}:${verse.v}` : `${verse.v}`;
    const lines = [];
    if (lang !== 'en') lines.push(`${toBurmese(number)} ${verse.my}`.trim());
    if (lang !== 'my') lines.push(`${number} ${verse.en}`.trim());
    return lines;
  }

  // Every verse containing all the words, in one translation. Burmese ignores spaces, since the
  // Judson text has spaces between most words. onProgress(booksDone, totalBooks) while loading.
  async function search(query, lang, onProgress) {
    const list = await books();
    const words = query.split(/\s+/).filter(Boolean).map((w) => (lang === 'my' ? w : w.toLowerCase()));
    const needle = lang === 'my' ? [query.replace(/\s+/g, '')] : words;
    let done = 0;
    const texts = await Promise.all(list.map((book) => bookText(lang, book.code).then((text) => {
      onProgress?.(++done, list.length);
      return text;
    })));
    const results = [];
    list.forEach((book, b) => texts[b].forEach((verseTexts, c) => verseTexts.forEach((text, v) => {
      const hay = lang === 'my' ? text.replace(/\s+/g, '') : text.toLowerCase();
      if (text && needle.every((w) => hay.includes(w))) results.push({ ref: { book, start: [c + 1, v + 1], end: [c + 1, v + 1] }, text });
    })));
    return results;
  }

  window.Bible = { books, parse, id, fromId, chapter, part, label, verses, passage, verseLines, search, toBurmese };
})();
