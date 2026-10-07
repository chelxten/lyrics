// The Bible page: find a passage by reference, by book and chapter, or by searching for words, and
// add it to the set of songs (the same list as + in the song library). See bible.js.
(function () {
  const q = (sel) => document.querySelector(sel);
  const ui = {
    input: q('#bible-q'),
    book: q('#bible-book'),
    chapter: q('#bible-chapter'),
    langs: document.querySelectorAll('input[name="bible-lang"]'),
    status: q('#bible-status'),
    passage: q('#bible-passage'),
    title: q('#passage-title'),
    add: q('#passage-add'),
    hint: q('#passage-hint'),
    verses: q('#passage-verses'),
    results: q('#bible-results'),
    resultsTitle: q('#results-title'),
    resultsList: q('#results-list'),
  };
  const LANG_KEY = 'lyrics-bible-lang';
  const LAST_KEY = 'lyrics-bible-last';
  const MAX_RESULTS = 200;
  const storage = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let books = [];
  let shown = null; // { ref, verses } on the page
  let selection = null; // [first, last] verse indexes chosen by tapping, or null for the whole passage
  let choosingEnd = false;
  let lastResults = [];

  const lang = () => [...ui.langs].find((input) => input.checked)?.value || 'my';

  // ---- The passage on the page ----

  async function show(ref, select = null) {
    ui.status.textContent = '';
    const verses = await Bible.verses(ref);
    shown = { ref, verses };
    selection = select;
    choosingEnd = Boolean(select);
    ui.book.value = ref.book.code;
    fillChapters(ref.book);
    ui.chapter.value = String(ref.start[0]);
    ui.results.hidden = true;
    storage.set(LAST_KEY, Bible.id(ref));
    render();
  }

  function chosenRef() {
    if (!shown) return null;
    if (!selection) return shown.ref;
    const [a, b] = [Math.min(...selection), Math.max(...selection)];
    return Bible.part(shown.ref, shown.verses.slice(a, b + 1));
  }

  function render() {
    if (!shown) return;
    ui.passage.hidden = false;
    ui.title.textContent = Bible.label(shown.ref, lang());
    const [a, b] = selection ? [Math.min(...selection), Math.max(...selection)] : [-1, -1];
    ui.verses.innerHTML = shown.verses
      .map((verse, i) => `
        <li><button type="button" data-i="${i}" class="${i >= a && i <= b ? 'is-selected' : ''}">
          ${Bible.verseLines(verse, lang(), shown.ref).map((line) => `<span>${escapeHtml(line)}</span>`).join('')}
        </button></li>`)
      .join('');
    renderAdd();
  }

  function renderAdd() {
    if (!shown) return;
    const ref = chosenRef();
    const on = SongSelection.all().includes(Bible.id(ref));
    ui.add.textContent = on ? `✓ ${Bible.label(ref, 'my')} is in your set` : `+ Add ${Bible.label(ref, 'my')}`;
    ui.add.title = on ? 'Remove it from your set' : 'Add it to your set';
    ui.add.classList.toggle('is-added', on);
    ui.hint.textContent = !selection
      ? 'Tap a verse to add only some verses.'
      : choosingEnd
        ? 'Tap another verse to choose where the passage ends.'
        : 'Tap a verse to start again, or add these verses.';
  }

  ui.verses.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-i]');
    if (!button) return;
    const i = Number(button.dataset.i);
    if (selection && choosingEnd) {
      selection = [selection[0], i];
      choosingEnd = false;
    } else {
      selection = [i, i];
      choosingEnd = true;
    }
    render();
  });

  ui.add.addEventListener('click', () => {
    const id = Bible.id(chosenRef());
    const all = SongSelection.all();
    SongSelection.set(all.includes(id) ? all.filter((s) => s !== id) : [...all, id]);
    renderAdd();
  });
  SongSelection.onChange(renderAdd);

  // ---- Book and chapter ----

  function fillChapters(book) {
    if (ui.chapter.dataset.book === book.code) return;
    ui.chapter.dataset.book = book.code;
    ui.chapter.innerHTML = book.chapters.map((_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
  }
  ui.book.addEventListener('change', () => {
    const book = books.find((b) => b.code === ui.book.value);
    show(Bible.chapter(book, 1));
  });
  ui.chapter.addEventListener('change', () => {
    const book = books.find((b) => b.code === ui.book.value);
    show(Bible.chapter(book, Number(ui.chapter.value)));
  });

  // ---- Typing: a reference shows the passage; Enter searches for words ----

  let timer;
  ui.input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const text = ui.input.value.trim();
      if (!text) {
        ui.status.textContent = '';
        return;
      }
      const ref = await Bible.parse(text);
      if (ref) show(ref);
      else ui.status.textContent = 'Press Enter to search the whole Bible for these words.';
    }, 250);
  });
  ui.input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(timer);
    const text = ui.input.value.trim();
    if (!text) return;
    const ref = await Bible.parse(text);
    if (ref) show(ref);
    else searchWords(text);
  });

  async function searchWords(text) {
    const inBurmese = /[\u1000-\u109f]/.test(text);
    ui.status.textContent = 'Searching the whole Bible…';
    try {
      lastResults = await Bible.search(text, inBurmese ? 'my' : 'en', (done, total) => {
        ui.status.textContent = `Searching the whole Bible… ${done} of ${total} books`;
      });
    } catch {
      ui.status.textContent = 'Couldn’t search the Bible. Check your connection and try again.';
      return;
    }
    ui.status.textContent = '';
    ui.passage.hidden = true;
    ui.results.hidden = false;
    ui.resultsTitle.textContent = lastResults.length
      ? `${lastResults.length} ${lastResults.length === 1 ? 'verse' : 'verses'} with “${text}”${lastResults.length > MAX_RESULTS ? ` (showing the first ${MAX_RESULTS})` : ''}`
      : `No verses with “${text}”`;
    ui.resultsList.innerHTML = lastResults
      .slice(0, MAX_RESULTS)
      .map(({ ref, text: verse }, i) => `
        <li><button type="button" data-result="${i}">
          <strong>${escapeHtml(Bible.label(ref, inBurmese ? 'my' : 'en'))}</strong>
          <span>${escapeHtml(verse)}</span>
        </button></li>`)
      .join('');
  }

  // A search result opens its chapter with the verse chosen.
  ui.resultsList.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-result]');
    if (!button) return;
    const { ref } = lastResults[Number(button.dataset.result)];
    const verse = ref.start[1] - 1;
    show(Bible.chapter(ref.book, ref.start[0]), [verse, verse]).then(() => {
      choosingEnd = true;
      renderAdd();
      ui.verses.children[verse]?.scrollIntoView({ block: 'center' });
    });
  });

  ui.langs.forEach((input) => input.addEventListener('change', () => {
    storage.set(LANG_KEY, lang());
    render();
  }));

  // ---- Start ----

  const savedLang = storage.get(LANG_KEY);
  ui.langs.forEach((input) => { input.checked = input.value === (savedLang || 'my'); });
  SongSelection.mountTray();
  Bible.books().then(async (list) => {
    books = list;
    const group = (from, to, title) => `<optgroup label="${title}">${list.slice(from, to).map((b) => `<option value="${b.code}">${escapeHtml(b.my)} · ${escapeHtml(b.en)}</option>`).join('')}</optgroup>`;
    ui.book.innerHTML = group(0, 39, 'Old Testament') + group(39, 66, 'New Testament');
    const last = await Bible.fromId(storage.get(LAST_KEY) || '');
    show(last || Bible.chapter(list.find((b) => b.code === 'JHN'), 1));
  }).catch(() => {
    ui.status.textContent = 'Couldn’t load the Bible. Check your connection and reload the page.';
  });
})();
