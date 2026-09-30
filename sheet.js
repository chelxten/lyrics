// Song sheet: lays the picked songs out on the chosen pages. With "Fit to pages" it uses the
// largest text that fits; otherwise it uses the chosen text size and as many pages as needed.
// Songs flow down each column and on to the next; a verse is never split unless it is longer
// than a whole column. Edits made with ✎ apply to this sheet only, never to the song files.

const PAGE_SIZES = { A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4], Legal: [215.9, 355.6] }; // mm, portrait
const MARGIN = 12; // mm around the page
const COLUMN_GAP = 10; // mm between columns (a line is drawn in the middle)
const MIN_COLUMN = 45; // mm, narrowest column for automatic columns
const MIN_FONT = 6; // pt
const MAX_AUTO_FONT = 14; // pt, largest size "Fit to pages" will pick
const MAX_FONT = 24; // pt, largest size that can be chosen by hand
const FONT_STEP = 0.25; // pt, precision of "Fit to pages"
const MANUAL_STEP = 0.5; // pt, one press of − / +
const MAX_PAGES = 20;
const SONG_GAP = 2; // em of space before each song
const STANZA_GAP = 1; // em of space before each verse
const HEADER_GAP = 4; // mm below the sheet title
const SAFETY = 0.98; // leave a little room so printing never spills over
const PRINT_SLACK = 0.5; // mm the printed page is shorter than the paper, so rounding never adds a blank page
const BURMESE_DIGITS = '၀၁၂၃၄၅၆၇၈၉';
const LABEL_LINE = /^\s*\[([^\]]*)\]\s*$/;

const $ = (sel) => document.querySelector(sel);
const ui = {
  list: $('#sheet-songs'),
  count: $('#song-count'),
  empty: $('#no-songs'),
  title: $('#sheet-title'),
  size: $('#size'),
  orient: $('#orient'),
  pages: $('#pages'),
  fewer: $('#fewer'),
  more: $('#more'),
  cols: $('#cols'),
  fontSize: $('#font-size'),
  autoFont: $('#auto-font'),
  labels: $('#labels'),
  fit: $('#fit'),
  out: $('#pages-out'),
  measure: $('#measure'),
  pageStyle: $('#page-size'),
  editor: $('#line-editor'),
  editTitle: $('#edit-title'),
  editText: $('#edit-text'),
};

let songsBySlug = {};
let picked = [];
let edits = {}; // slug -> { text, base } where base is the song's lyrics when it was edited
let manualFont = null; // pt, or null for "Fit to pages"
let lastFont = 11; // size used by the latest layout
let editing = null; // slug open in the sheet editor
let encodedEdits = ''; // edits packed into the share link
let lastLayout = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const burmeseNumber = (n) => String(n).replace(/\d/g, (d) => BURMESE_DIGITS[d]);
const clampPages = (n) => Math.min(MAX_PAGES, Math.max(1, parseInt(n, 10) || 1));
const clampFont = (n) => Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(n / MANUAL_STEP) * MANUAL_STEP));
const pickedSongs = () => picked.map((slug) => songsBySlug[slug]).filter(Boolean);

// The text used for a song on this sheet: the edited version if there is one.
function sheetText(song) {
  const edit = edits[song.slug];
  return edit && edit.base === song.lyrics ? edit.text : song.lyrics;
}

// [Verse 1] -> "V1", [Chorus] -> "CHO:", and so on, like a printed song sheet.
function shortLabel(label) {
  const verse = label.match(/^verse\s*(\d*)$/i);
  if (verse) return `V${verse[1]}`;
  if (/^chorus$/i.test(label)) return 'CHO:';
  if (/^pre-?\s?chorus$/i.test(label)) return 'Pre:';
  return `${label}:`;
}

// ---- Storage and the share link ----

function storageGet(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// Edits are compressed so a shared link stays a reasonable length.
const canCompress = typeof CompressionStream === 'function';
function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const fromBase64Url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function packEdits(obj) {
  if (!canCompress || !Object.keys(obj).length) return '';
  const stream = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}
async function unpackEdits(s) {
  if (!canCompress || !s) return null;
  try {
    const stream = new Blob([fromBase64Url(s)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return JSON.parse(await new Response(stream).text());
  } catch {
    return null;
  }
}

function readSettings() {
  const params = new URLSearchParams(location.hash.slice(1));
  const saved = storageGet('lyrics-sheet-settings', {});
  const pick = (key, fallback) => params.get(key) ?? saved[key] ?? fallback;
  ui.size.value = PAGE_SIZES[pick('size', 'A4')] ? pick('size', 'A4') : 'A4';
  ui.orient.value = pick('orient', 'portrait') === 'landscape' ? 'landscape' : 'portrait';
  ui.cols.value = ['auto', '1', '2', '3'].includes(pick('cols', '2')) ? pick('cols', '2') : '2';
  ui.labels.checked = pick('labels', '1') !== '0';
  ui.pages.value = clampPages(params.get('pages') ?? 1);
  ui.title.value = params.get('title') ?? '';
  const font = params.get('font');
  manualFont = font && font !== 'auto' ? clampFont(parseFloat(font)) : null;
  return { songs: params.getAll('s'), edits: params.get('edits') };
}

function saveSettings() {
  const params = new URLSearchParams();
  picked.forEach((slug) => params.append('s', slug));
  params.set('size', ui.size.value);
  params.set('orient', ui.orient.value);
  params.set('cols', ui.cols.value);
  params.set('pages', ui.pages.value);
  params.set('font', manualFont ?? 'auto');
  params.set('labels', ui.labels.checked ? '1' : '0');
  if (ui.title.value.trim()) params.set('title', ui.title.value.trim());
  if (encodedEdits) params.set('edits', encodedEdits);
  history.replaceState(null, '', `#${params}`);
  storageSet('lyrics-sheet-settings', { size: ui.size.value, orient: ui.orient.value, cols: ui.cols.value, labels: ui.labels.checked ? '1' : '0' });
}

let editsTimer;
function editsChanged() {
  // Only keep edits for songs on the sheet that still match the song they were made from.
  for (const slug of Object.keys(edits)) {
    const song = songsBySlug[slug];
    if (!picked.includes(slug) || !song || edits[slug].base !== song.lyrics || edits[slug].text === song.lyrics) delete edits[slug];
  }
  storageSet('lyrics-sheet-edits', edits);
  clearTimeout(editsTimer);
  editsTimer = setTimeout(async () => {
    encodedEdits = await packEdits(edits);
    saveSettings();
  }, 400);
}

// ---- Picked songs list ----

function renderSongList() {
  const songs = pickedSongs();
  ui.count.textContent = songs.length ? `(${songs.length})` : '';
  ui.empty.hidden = songs.length > 0;
  ui.list.innerHTML = songs
    .map((song, i) => `
      <li class="${editing === song.slug ? 'is-editing' : ''}">
        <span class="name">${escapeHtml(song.title)}${edits[song.slug] ? ' <small class="edited">edited</small>' : ''}</span>
        <span class="tools">
          <button type="button" data-edit="${i}" aria-label="Edit ${escapeHtml(song.title)} for this sheet" title="Edit for this sheet">✎</button>
          <button type="button" data-move="-1" data-i="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-move="1" data-i="${i}" aria-label="Move down" ${i === songs.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" data-remove="${i}" aria-label="Remove">✕</button>
        </span>
      </li>`)
    .join('');
}

ui.list.addEventListener('click', (e) => {
  const button = e.target.closest('button');
  if (!button) return;
  const songs = picked.filter((slug) => songsBySlug[slug]);
  if (button.dataset.edit !== undefined) {
    openEditor(songs[Number(button.dataset.edit)]);
    return;
  }
  if (button.dataset.remove !== undefined) {
    const [removed] = songs.splice(Number(button.dataset.remove), 1);
    if (removed === editing) closeEditor();
  } else {
    const i = Number(button.dataset.i);
    const j = i + Number(button.dataset.move);
    [songs[i], songs[j]] = [songs[j], songs[i]];
  }
  picked = songs;
  SongSelection.set(picked);
  editsChanged();
  update();
});

// ---- Sheet editor: change the words or lines of a song for this sheet only ----

ui.editText.addEventListener('input', () => {
  const song = songsBySlug[editing];
  if (!song) return;
  edits[song.slug] = { text: ui.editText.value, base: song.lyrics };
  editsChanged();
  scheduleUpdate();
});

function openEditor(slug) {
  const song = songsBySlug[slug];
  if (!song) return;
  editing = slug;
  ui.editTitle.textContent = song.title;
  ui.editText.value = sheetText(song);
  ui.editor.hidden = false;
  renderSongList();
  ui.editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  ui.editText.focus({ preventScroll: true });
}

function closeEditor() {
  editing = null;
  ui.editor.hidden = true;
  renderSongList();
}

$('#edit-done').addEventListener('click', closeEditor);
$('#edit-reset').addEventListener('click', () => {
  const song = songsBySlug[editing];
  if (!song || !confirm('Undo all changes to this song on the sheet?')) return;
  delete edits[song.slug];
  ui.editText.value = song.lyrics;
  editsChanged();
  update();
});

// ---- Building blocks: a song title with its first verse, then each further verse ----

function stanzaHtml(lines) {
  const showLabels = ui.labels.checked;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const label = lines[i].match(LABEL_LINE);
    if (!label) {
      out.push(escapeHtml(lines[i].trim()));
    } else if (showLabels) {
      // A label is joined to the line after it: "[Chorus]" + "..." -> "CHO: ..."
      const next = lines[i + 1] !== undefined && !LABEL_LINE.test(lines[i + 1]) ? lines[++i] : '';
      out.push(`${escapeHtml(shortLabel(label[1].trim()))} ${escapeHtml(next.trim())}`.trim());
    }
  }
  return out.join('\n');
}

function buildBlocks(songs) {
  const showLabels = ui.labels.checked;
  const blocks = [];
  songs.forEach((song, n) => {
    const stanzas = sheetText(song)
      .split(/\n\s*\n/)
      .map((s) => s.split('\n').filter((l) => l.trim()))
      .filter((lines) => lines.some((l) => showLabels || !LABEL_LINE.test(l)));
    const title = `<div class="sheet-song-title">${burmeseNumber(n + 1)}။ ${escapeHtml(song.title)}</div>`;
    if (!stanzas.length) {
      blocks.push({ html: `<div class="sheet-block">${title}</div>`, gap: 'song' });
      return;
    }
    stanzas.forEach((lines, i) => {
      const body = `<div class="sheet-stanza">${stanzaHtml(lines)}</div>`;
      blocks.push({ html: `<div class="sheet-block">${i === 0 ? title : ''}${body}</div>`, gap: i === 0 ? 'song' : 'stanza' });
    });
  });
  return blocks;
}

// ---- Measuring and packing ----

let pxPerMm = 3.7795;
function measurePxPerMm() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;width:100mm;height:0';
  document.body.appendChild(probe);
  pxPerMm = probe.getBoundingClientRect().width / 100 || pxPerMm;
  probe.remove();
}

let measuredHtml = '';
function measureBlocks(blocks, columnMm, fontPt) {
  const html = blocks.map((b) => b.html).join('');
  if (html !== measuredHtml) {
    ui.measure.innerHTML = html;
    measuredHtml = html;
  }
  ui.measure.style.width = `${columnMm}mm`;
  ui.measure.style.fontSize = `${fontPt}pt`;
  return [...ui.measure.children].map((el) => el.getBoundingClientRect().height);
}

function measureHeader(text, widthMm) {
  if (!text) return 0;
  const el = document.createElement('div');
  el.className = 'sheet-header sheet-text';
  el.style.cssText = `position:absolute;visibility:hidden;width:${widthMm}mm`;
  el.textContent = text;
  document.body.appendChild(el);
  const mm = el.getBoundingClientRect().height / pxPerMm;
  el.remove();
  return mm + HEADER_GAP;
}

// Places blocks into columns in order. Returns the columns (lists of block indexes), or null if
// they need more than maxColumns. With force, a block taller than a column still gets placed.
function pack(blocks, heights, fontPt, cols, maxColumns, contentMm, headerMm, force = false) {
  const fontPx = (fontPt * 96) / 72;
  const capacity = (index) => (index < cols ? contentMm - headerMm : contentMm) * pxPerMm * SAFETY;
  const columns = [];
  let column = [];
  let used = 0;
  for (let i = 0; i < blocks.length; i++) {
    const gap = column.length ? (blocks[i].gap === 'song' ? SONG_GAP : STANZA_GAP) * fontPx : 0;
    if (used + gap + heights[i] <= capacity(columns.length)) {
      column.push(i);
      used += gap + heights[i];
      continue;
    }
    if (column.length) {
      columns.push(column);
      if (columns.length >= maxColumns) return null;
    }
    if (heights[i] > capacity(columns.length) && !force) return null;
    column = [i];
    used = heights[i];
  }
  columns.push(column);
  return columns.length <= maxColumns ? columns : null;
}

function columnChoices(contentW) {
  if (ui.cols.value !== 'auto') return [Number(ui.cols.value)];
  const max = Math.min(3, Math.max(1, Math.floor((contentW + COLUMN_GAP) / (MIN_COLUMN + COLUMN_GAP))));
  return Array.from({ length: max }, (_, i) => i + 1);
}

const columnWidth = (contentW, cols) => (contentW - COLUMN_GAP * (cols - 1)) / cols;

// Fit to pages: the largest text that fits on the chosen number of pages.
function fitLayout(blocks, pages, contentW, contentH, headerMm) {
  let best = null;
  for (const cols of columnChoices(contentW)) {
    const columnMm = columnWidth(contentW, cols);
    const tryFont = (font) => pack(blocks, measureBlocks(blocks, columnMm, font), font, cols, cols * pages, contentH, headerMm);
    if (!tryFont(MIN_FONT)) continue;
    let lo = 0;
    let hi = Math.round((MAX_AUTO_FONT - MIN_FONT) / FONT_STEP);
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (tryFont(MIN_FONT + mid * FONT_STEP)) lo = mid;
      else hi = mid - 1;
    }
    const font = MIN_FONT + lo * FONT_STEP;
    if (!best || font > best.font) best = { cols, columnMm, font, columns: tryFont(font), fits: true };
  }
  return best || fixedLayout(blocks, MIN_FONT, contentW, contentH, headerMm, false);
}

// Chosen text size: as many pages as it takes (fewest pages when columns are automatic).
function fixedLayout(blocks, font, contentW, contentH, headerMm, fits = true) {
  let best = null;
  for (const cols of columnChoices(contentW)) {
    const columnMm = columnWidth(contentW, cols);
    const columns = pack(blocks, measureBlocks(blocks, columnMm, font), font, cols, Infinity, contentH, headerMm, true);
    const pages = Math.ceil(columns.length / cols);
    if (!best || pages < best.pages) best = { cols, columnMm, font, columns, fits, pages };
  }
  return best;
}

// ---- Rendering ----

function update() {
  saveSettings();
  renderSongList();
  const songs = pickedSongs();
  const [pw, ph] = PAGE_SIZES[ui.size.value];
  const [w, h] = ui.orient.value === 'landscape' ? [ph, pw] : [pw, ph];
  ui.pageStyle.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }
    @media print { .sheet-page { height: ${h - PRINT_SLACK}mm !important; } }`;
  ui.autoFont.checked = manualFont === null;
  [ui.pages, ui.fewer, ui.more].forEach((el) => { el.disabled = manualFont !== null; });

  if (!songs.length) {
    ui.out.innerHTML = '';
    ui.fit.textContent = '';
    ui.fontSize.textContent = manualFont ? `${manualFont} pt` : 'Auto';
    lastLayout = null;
    return;
  }

  const pages = clampPages(ui.pages.value);
  const contentW = w - 2 * MARGIN;
  const contentH = h - 2 * MARGIN;
  const title = ui.title.value.trim();
  const headerMm = measureHeader(title, contentW);
  const blocks = buildBlocks(songs);
  const layout = manualFont === null
    ? fitLayout(blocks, pages, contentW, contentH, headerMm)
    : fixedLayout(blocks, manualFont, contentW, contentH, headerMm);
  const pagesUsed = Math.max(1, Math.ceil(layout.columns.length / layout.cols));
  lastFont = layout.font;
  ui.fontSize.textContent = `${layout.font} pt`;

  const pagesHtml = [];
  for (let p = 0; p < pagesUsed; p++) {
    const columns = [];
    for (let c = 0; c < layout.cols; c++) {
      const indexes = layout.columns[p * layout.cols + c] || [];
      const inner = indexes
        .map((i, k) => {
          const gap = k === 0 ? 0 : blocks[i].gap === 'song' ? SONG_GAP : STANZA_GAP;
          return blocks[i].html.replace('<div class="sheet-block">', `<div class="sheet-block" style="margin-top:${gap}em">`);
        })
        .join('');
      columns.push(`<div class="sheet-col" style="width:${layout.columnMm}mm">${inner}</div>`);
    }
    const rules = Array.from({ length: layout.cols - 1 }, (_, c) => {
      const x = MARGIN + (c + 1) * layout.columnMm + c * COLUMN_GAP + COLUMN_GAP / 2;
      const top = MARGIN + (p === 0 ? headerMm : 0);
      return `<div class="sheet-rule" style="left:${x}mm;top:${top}mm;bottom:${MARGIN}mm"></div>`;
    }).join('');
    pagesHtml.push(`
      <div class="sheet-page sheet-text" style="width:${w}mm;height:${h}mm;padding:${MARGIN}mm;font-size:${layout.font}pt">
        ${p === 0 && title ? `<div class="sheet-header" style="margin-bottom:${HEADER_GAP}mm">${escapeHtml(title)}</div>` : ''}
        <div class="sheet-cols" style="gap:${COLUMN_GAP}mm">${columns.join('')}</div>
        ${rules}
        ${pagesUsed > 1 ? `<div class="sheet-page-number">${p + 1} / ${pagesUsed}</div>` : ''}
      </div>`);
  }
  ui.out.innerHTML = pagesHtml.join('');
  lastLayout = { w };
  scalePreview();

  const pageWord = (n) => `${n} ${n === 1 ? 'page' : 'pages'}`;
  const details = `${layout.cols} ${layout.cols === 1 ? 'column' : 'columns'}, text size ${layout.font} pt`;
  ui.fit.className = layout.fits ? 'fit' : 'fit warn';
  if (manualFont !== null) {
    ui.fit.textContent = `Uses ${pageWord(pagesUsed)} (${details}).`;
  } else if (!layout.fits) {
    ui.fit.textContent = `These songs don’t fit on ${pageWord(pages)}, even with the smallest text. They need ${pageWord(pagesUsed)}, so add pages or remove songs.`;
  } else if (pagesUsed < pages) {
    ui.fit.textContent = `Everything fits on ${pageWord(pagesUsed)} at the largest text size (${details}).`;
  } else {
    ui.fit.textContent = `Fits on ${pageWord(pagesUsed)}: ${details}.`;
  }
}

// Shrink the on-screen preview to fit the window; printing always uses the real size.
function scalePreview() {
  if (!lastLayout) return;
  const available = ui.out.parentElement.clientWidth - 2;
  ui.out.style.zoom = Math.min(1, available / (lastLayout.w * pxPerMm));
}

// ---- Controls ----

let timer;
function scheduleUpdate() {
  clearTimeout(timer);
  timer = setTimeout(update, 150);
}

[ui.size, ui.orient, ui.cols, ui.labels].forEach((el) => el.addEventListener('change', update));
ui.pages.addEventListener('input', scheduleUpdate);
ui.pages.addEventListener('change', () => { ui.pages.value = clampPages(ui.pages.value); update(); });
ui.title.addEventListener('input', scheduleUpdate);
ui.fewer.addEventListener('click', () => { ui.pages.value = clampPages(+ui.pages.value - 1); update(); });
ui.more.addEventListener('click', () => { ui.pages.value = clampPages(+ui.pages.value + 1); update(); });

// − / + switch to a chosen size, starting from the size currently shown.
$('#smaller').addEventListener('click', () => { manualFont = clampFont((manualFont ?? lastFont) - MANUAL_STEP); update(); });
$('#bigger').addEventListener('click', () => { manualFont = clampFont((manualFont ?? lastFont) + MANUAL_STEP); update(); });
ui.autoFont.addEventListener('change', () => {
  manualFont = ui.autoFont.checked ? null : clampFont(lastFont);
  update();
});

$('#print').addEventListener('click', () => window.print());
$('#copy').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  clearTimeout(editsTimer);
  encodedEdits = await packEdits(edits);
  saveSettings();
  try {
    await navigator.clipboard.writeText(location.href);
    button.textContent = 'Link copied';
  } catch {
    prompt('Copy this link:', location.href);
  }
  setTimeout(() => { button.textContent = 'Copy link'; }, 2000);
});
window.addEventListener('resize', scalePreview);

// If songs change in another tab (e.g. + on the song list), follow along.
SongSelection.onChange((songs) => {
  if (songs.join('\n') === picked.join('\n')) return;
  picked = songs;
  if (editing && !picked.includes(editing)) closeEditor();
  editsChanged();
  update();
});

// ---- Start ----

const fromLink = readSettings();
measurePxPerMm();
fetch('songs.json', { cache: 'no-cache' })
  .then((r) => r.json())
  .then(async (data) => {
    songsBySlug = Object.fromEntries(data.map((s) => [s.slug, s]));
    // A shared link brings its own songs and edits; otherwise use this browser's.
    if (fromLink.songs.length) {
      picked = fromLink.songs.filter((slug) => songsBySlug[slug]);
      SongSelection.set(picked);
      edits = (await unpackEdits(fromLink.edits)) || {};
    } else {
      picked = SongSelection.all().filter((slug) => songsBySlug[slug]);
      edits = storageGet('lyrics-sheet-edits', {});
    }
    editsChanged();
    // Wait for fonts so measurements match what gets printed.
    return document.fonts ? document.fonts.ready : null;
  })
  .then(update)
  .catch(() => {
    ui.fit.className = 'fit warn';
    ui.fit.textContent = 'Couldn’t load the songs. Check your connection and reload the page.';
  });
