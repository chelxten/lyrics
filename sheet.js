// Song sheet: lays the picked songs out on the chosen pages. With "Fit to pages" it uses the
// largest text that fits; otherwise it uses the chosen text size and as many pages as needed.
// Songs flow down each column and on to the next; a verse is never split unless it is longer
// than a whole column. With "Move the whole song to the next column", a song that doesn't fit in
// the rest of a column starts in the next one instead (unless it's longer than a whole column). The song list and ✎ edits are shared with the slides (see setlist.js).

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
const IMAGE_SCALE = 2.5; // JPG pixels per screen pixel: about 240 dpi, sharp enough to print
const IMAGE_LIBRARY = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
const IMAGE_LIBRARY_INTEGRITY = 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H';

const $ = (sel) => document.querySelector(sel);
const ui = {
  title: $('#sheet-title'),
  size: $('#size'),
  orient: $('#orient'),
  pages: $('#pages'),
  fewer: $('#fewer'),
  more: $('#more'),
  cols: $('#cols'),
  split: $('#split'),
  fontSize: $('#font-size'),
  autoFont: $('#auto-font'),
  labels: $('#labels'),
  fit: $('#fit'),
  out: $('#pages-out'),
  measure: $('#measure'),
  pageStyle: $('#page-size'),
  imageButtons: document.querySelectorAll('.download-jpg'),
};

const { escapeHtml, burmeseNumber } = SetList;
let manualFont = null; // pt, or null for "Fit to pages"
let lastFont = 11; // size used by the latest layout
let lastLayout = null;
let viewOnly = false; // opened from a shared link: show only the sheet

const clampPages = (n) => Math.min(MAX_PAGES, Math.max(1, parseInt(n, 10) || 1));
const clampFont = (n) => Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(n / MANUAL_STEP) * MANUAL_STEP));

// ---- Settings and the share link ----

function readSettings() {
  const params = new URLSearchParams(location.hash.slice(1));
  const saved = SetList.storageGet('lyrics-sheet-settings', {});
  const pick = (key, fallback) => params.get(key) ?? saved[key] ?? fallback;
  ui.size.value = PAGE_SIZES[pick('size', 'A4')] ? pick('size', 'A4') : 'A4';
  ui.orient.value = pick('orient', 'portrait') === 'landscape' ? 'landscape' : 'portrait';
  ui.cols.value = ['auto', '1', '2', '3'].includes(pick('cols', '2')) ? pick('cols', '2') : '2';
  ui.split.value = pick('split', 'flow') === 'keep' ? 'keep' : 'flow';
  ui.labels.checked = pick('labels', '1') !== '0';
  ui.pages.value = clampPages(params.get('pages') ?? 1);
  ui.title.value = params.get('title') ?? '';
  const font = params.get('font');
  manualFont = font && font !== 'auto' ? clampFont(parseFloat(font)) : null;
  viewOnly = params.get('view') === '1';
  return { songs: params.getAll('s'), edits: params.get('edits'), viewOnly };
}

function saveSettings() {
  const params = new URLSearchParams();
  SetList.slugs().forEach((slug) => params.append('s', slug));
  params.set('size', ui.size.value);
  params.set('orient', ui.orient.value);
  params.set('cols', ui.cols.value);
  params.set('split', ui.split.value);
  params.set('pages', ui.pages.value);
  params.set('font', manualFont ?? 'auto');
  params.set('labels', ui.labels.checked ? '1' : '0');
  if (ui.title.value.trim()) params.set('title', ui.title.value.trim());
  if (SetList.encodedEdits()) params.set('edits', SetList.encodedEdits());
  if (viewOnly) params.set('view', '1');
  history.replaceState(null, '', `#${params}`);
  if (!viewOnly) SetList.storageSet('lyrics-sheet-settings', { size: ui.size.value, orient: ui.orient.value, cols: ui.cols.value, split: ui.split.value, labels: ui.labels.checked ? '1' : '0' });
}

// ---- Building blocks: a song title with its first verse, then each further verse ----

function buildBlocks(songs) {
  const blocks = [];
  songs.forEach((song, n) => {
    const verses = SetList.verses(song, ui.labels.checked);
    const title = `<div class="sheet-song-title">${burmeseNumber(n + 1)}။ ${escapeHtml(song.title)}</div>`;
    if (!verses.length) {
      blocks.push({ html: `<div class="sheet-block">${title}</div>`, gap: 'song' });
      return;
    }
    verses.forEach((lines, i) => {
      const body = `<div class="sheet-stanza">${lines.map(escapeHtml).join('\n')}</div>`;
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
  const keepSongs = ui.split.value === 'keep';
  // Height of the song that starts at block i: its verses and the space between them.
  const songHeight = (i) => {
    let height = heights[i];
    for (let j = i + 1; j < blocks.length && blocks[j].gap === 'stanza'; j++) height += STANZA_GAP * fontPx + heights[j];
    return height;
  };
  const columns = [];
  let column = [];
  let used = 0;
  let longSong = false; // a song longer than a whole column, which has to continue anyway
  for (let i = 0; i < blocks.length; i++) {
    if (keepSongs && blocks[i].gap === 'song') {
      const height = songHeight(i);
      if (height > capacity(column.length ? columns.length + 1 : columns.length)) {
        longSong = true;
      } else if (column.length && used + SONG_GAP * fontPx + height > capacity(columns.length)) {
        // Start the song in the next column, so it isn't split.
        columns.push(column);
        if (columns.length >= maxColumns) return null;
        column = [];
        used = 0;
      }
    }
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
  return columns.length <= maxColumns ? Object.assign(columns, { longSong }) : null;
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
  SetList.render();
  const songs = SetList.songs();
  const [pw, ph] = PAGE_SIZES[ui.size.value];
  const [w, h] = ui.orient.value === 'landscape' ? [ph, pw] : [pw, ph];
  ui.pageStyle.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }
    @media print { .sheet-page { height: ${h - PRINT_SLACK}mm !important; } }`;
  ui.autoFont.checked = manualFont === null;
  [ui.pages, ui.fewer, ui.more].forEach((el) => { el.disabled = manualFont !== null; });

  if (!songs.length) {
    ui.out.innerHTML = viewOnly ? '<p class="muted">This song sheet has no songs.</p>' : '';
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
  if (ui.split.value === 'keep' && layout.columns.longSong) {
    ui.fit.textContent += ' Some songs are longer than a whole column, so they continue in the next column.';
  }
}

// Shrink the on-screen preview to fit the window; printing always uses the real size.
// This uses a transform rather than CSS zoom: under zoom, phones (iPhone Safari) keep text at a
// minimum size, so the preview wrapped differently from the real page.
function scalePreview() {
  if (!lastLayout) return;
  const available = ui.out.parentElement.clientWidth - 2;
  const width = lastLayout.w * pxPerMm;
  const scale = Math.min(1, available / width);
  Object.assign(ui.out.style, {
    width: `${width}px`,
    transform: scale < 1 ? `scale(${scale})` : '',
    transformOrigin: '0 0',
    // A transform doesn't change the space the pages take up: give back the space below them,
    // and center them on a shared sheet.
    marginBottom: `${-(1 - scale) * ui.out.offsetHeight}px`,
    marginLeft: viewOnly ? `${Math.max(0, (available - width * scale) / 2)}px` : '',
  });
}

// ---- JPG images: one per page ----

const fileName = () => SetList.fileName(ui.title.value, 'Song sheet');

async function downloadImages() {
  const pages = [...ui.out.querySelectorAll('.sheet-page')];
  if (!pages.length) return;
  ui.imageButtons.forEach((button) => {
    button.disabled = true;
    button.textContent = 'Making JPG…';
  });
  try {
    const html2canvas = await SetList.loadScript(IMAGE_LIBRARY, IMAGE_LIBRARY_INTEGRITY, 'html2canvas');
    const name = fileName();
    for (const [i, page] of pages.entries()) {
      const canvas = await html2canvas(page, {
        scale: IMAGE_SCALE,
        backgroundColor: '#ffffff',
        logging: false,
        // Draw the page at its real size, not the shrunk preview.
        onclone: (doc) => { Object.assign(doc.getElementById('pages-out').style, { transform: 'none', margin: '0' }); },
      });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      SetList.saveFile(blob, pages.length > 1 ? `${name} (${i + 1}).jpg` : `${name}.jpg`);
    }
  } catch {
    const message = 'Couldn’t make the JPG. Check your connection and try again.';
    ui.fit.className = 'fit warn';
    ui.fit.textContent = message;
    if (viewOnly) alert(message);
  } finally {
    ui.imageButtons.forEach((button) => {
      button.disabled = false;
      button.textContent = 'Download JPG';
    });
  }
}

// ---- Controls ----

let timer;
function scheduleUpdate() {
  clearTimeout(timer);
  timer = setTimeout(update, 150);
}

[ui.size, ui.orient, ui.cols, ui.split, ui.labels].forEach((el) => el.addEventListener('change', update));
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

[$('#print'), $('#view-print')].forEach((button) => button.addEventListener('click', () => window.print()));
ui.imageButtons.forEach((button) => button.addEventListener('click', downloadImages));
// "Copy link" gives a link that opens just the sheet, without the controls.
function viewLink() {
  const params = new URLSearchParams(location.hash.slice(1));
  params.set('view', '1');
  return `${location.origin}${location.pathname}#${params}`;
}

$('#copy').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  await SetList.flushEdits();
  saveSettings();
  try {
    await navigator.clipboard.writeText(viewLink());
    button.textContent = 'Link copied';
  } catch {
    prompt('Copy this link:', viewLink());
  }
  setTimeout(() => { button.textContent = 'Copy link to share'; }, 2000);
});
window.addEventListener('resize', scalePreview);

// ---- Start ----

const fromLink = readSettings();
if (viewOnly) {
  document.body.classList.add('view-only');
  if (ui.title.value.trim()) document.title = ui.title.value.trim();
}
measurePxPerMm();
SetList.start(fromLink, { update, scheduleUpdate, saveSettings })
  .then(update)
  .catch(() => {
    ui.fit.className = 'fit warn';
    ui.fit.textContent = 'Couldn’t load the songs. Check your connection and reload the page.';
  });
