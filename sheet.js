// Song sheet: lays the picked songs out on the chosen pages, with the largest text that fits.
// Songs flow down each column and on to the next; a verse is never split unless it is longer
// than a whole column.

const PAGE_SIZES = { A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4], Legal: [215.9, 355.6] }; // mm, portrait
const MARGIN = 12; // mm around the page
const COLUMN_GAP = 10; // mm between columns (a line is drawn in the middle)
const MIN_COLUMN = 45; // mm, narrowest column for automatic columns
const MIN_FONT = 6; // pt
const MAX_FONT = 14; // pt
const FONT_STEP = 0.25; // pt
const SONG_GAP = 2; // em of space before each song
const STANZA_GAP = 1; // em of space before each verse
const HEADER_GAP = 4; // mm below the sheet title
const SAFETY = 0.98; // leave a little room so printing never spills over
const BURMESE_DIGITS = '၀၁၂၃၄၅၆၇၈၉';

const $ = (sel) => document.querySelector(sel);
const ui = {
  list: $('#sheet-songs'),
  count: $('#song-count'),
  empty: $('#no-songs'),
  title: $('#sheet-title'),
  size: $('#size'),
  orient: $('#orient'),
  pages: $('#pages'),
  cols: $('#cols'),
  fit: $('#fit'),
  out: $('#pages-out'),
  measure: $('#measure'),
  pageStyle: $('#page-size'),
};

let songsBySlug = {};
let picked = [];
let lastLayout = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const burmeseNumber = (n) => String(n).replace(/\d/g, (d) => BURMESE_DIGITS[d]);

// [Verse 1] -> "V1", [Chorus] -> "CHO:", and so on, like a printed song sheet.
function shortLabel(label) {
  const verse = label.match(/^verse\s*(\d*)$/i);
  if (verse) return `V${verse[1]}`;
  if (/^chorus$/i.test(label)) return 'CHO:';
  if (/^pre-?\s?chorus$/i.test(label)) return 'Pre:';
  return `${label}:`;
}

// ---- Settings (kept in the link so a sheet can be shared) ----

function readSettings() {
  const params = new URLSearchParams(location.hash.slice(1));
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('lyrics-sheet-settings') || '{}'); } catch {}
  const pick = (key, fallback) => params.get(key) ?? saved[key] ?? fallback;
  ui.size.value = PAGE_SIZES[pick('size', 'A4')] ? pick('size', 'A4') : 'A4';
  ui.orient.value = pick('orient', 'portrait') === 'landscape' ? 'landscape' : 'portrait';
  ui.cols.value = ['auto', '1', '2', '3'].includes(pick('cols', '2')) ? pick('cols', '2') : '2';
  ui.pages.value = clampPages(params.get('pages') ?? 1);
  ui.title.value = params.get('title') ?? '';
  return params.getAll('s');
}

function saveSettings() {
  const params = new URLSearchParams();
  picked.forEach((slug) => params.append('s', slug));
  params.set('size', ui.size.value);
  params.set('orient', ui.orient.value);
  params.set('cols', ui.cols.value);
  params.set('pages', ui.pages.value);
  if (ui.title.value.trim()) params.set('title', ui.title.value.trim());
  history.replaceState(null, '', `#${params}`);
  try {
    localStorage.setItem('lyrics-sheet-settings', JSON.stringify({ size: ui.size.value, orient: ui.orient.value, cols: ui.cols.value }));
  } catch {}
}

const clampPages = (n) => Math.min(20, Math.max(1, parseInt(n, 10) || 1));

// ---- Picked songs list ----

function renderSongList() {
  const songs = picked.map((slug) => songsBySlug[slug]).filter(Boolean);
  ui.count.textContent = songs.length ? `(${songs.length})` : '';
  ui.empty.hidden = songs.length > 0;
  ui.list.innerHTML = songs
    .map((song, i) => `
      <li>
        <span class="name">${escapeHtml(song.title)}</span>
        <span class="tools">
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
  if (button.dataset.remove !== undefined) {
    songs.splice(Number(button.dataset.remove), 1);
  } else {
    const i = Number(button.dataset.i);
    const j = i + Number(button.dataset.move);
    [songs[i], songs[j]] = [songs[j], songs[i]];
  }
  picked = songs;
  SongSelection.set(picked);
  update();
});

// ---- Building blocks: a song title with its first verse, then each further verse ----

function stanzaHtml(lines) {
  // A label line is joined to the line after it: "[Chorus]" + "..." -> "CHO: ..."
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const label = lines[i].trim().match(/^\[([^\]]*)\]$/);
    if (label) {
      const next = lines[i + 1] !== undefined && !/^\s*\[[^\]]*\]\s*$/.test(lines[i + 1]) ? lines[++i] : '';
      out.push(`${escapeHtml(shortLabel(label[1].trim()))} ${escapeHtml(next.trim())}`.trim());
    } else {
      out.push(escapeHtml(lines[i].trim()));
    }
  }
  return out.join('\n');
}

function buildBlocks(songs) {
  const blocks = [];
  songs.forEach((song, n) => {
    const stanzas = song.lyrics.split(/\n\s*\n/).map((s) => s.split('\n')).filter((lines) => lines.some((l) => l.trim()));
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
  const capacity = (index) => ((index < cols ? contentMm - headerMm : contentMm) * pxPerMm) * SAFETY;
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

function findLayout(blocks, pages, contentW, contentH, headerMm) {
  const maxAuto = Math.min(3, Math.max(1, Math.floor((contentW + COLUMN_GAP) / (MIN_COLUMN + COLUMN_GAP))));
  const choices = ui.cols.value === 'auto' ? Array.from({ length: maxAuto }, (_, i) => i + 1) : [Number(ui.cols.value)];
  let best = null;

  for (const cols of choices) {
    const columnMm = (contentW - COLUMN_GAP * (cols - 1)) / cols;
    const tryFont = (font) => pack(blocks, measureBlocks(blocks, columnMm, font), font, cols, cols * pages, contentH, headerMm);
    let lo = 0;
    let hi = Math.round((MAX_FONT - MIN_FONT) / FONT_STEP);
    if (!tryFont(MIN_FONT)) continue;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (tryFont(MIN_FONT + mid * FONT_STEP)) lo = mid;
      else hi = mid - 1;
    }
    const font = MIN_FONT + lo * FONT_STEP;
    if (!best || font > best.font) best = { cols, columnMm, font, columns: tryFont(font), fits: true };
  }
  if (best) return best;

  // Doesn't fit: use the smallest text and as many pages as it takes.
  const cols = choices[choices.length - 1];
  const columnMm = (contentW - COLUMN_GAP * (cols - 1)) / cols;
  const columns = pack(blocks, measureBlocks(blocks, columnMm, MIN_FONT), MIN_FONT, cols, Infinity, contentH, headerMm, true);
  return { cols, columnMm, font: MIN_FONT, columns, fits: false };
}

// ---- Rendering ----

function update() {
  saveSettings();
  renderSongList();
  const songs = picked.map((slug) => songsBySlug[slug]).filter(Boolean);
  const [pw, ph] = PAGE_SIZES[ui.size.value];
  const [w, h] = ui.orient.value === 'landscape' ? [ph, pw] : [pw, ph];
  ui.pageStyle.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }`;

  if (!songs.length) {
    ui.out.innerHTML = '';
    ui.fit.textContent = '';
    lastLayout = null;
    return;
  }

  const pages = clampPages(ui.pages.value);
  const contentW = w - 2 * MARGIN;
  const contentH = h - 2 * MARGIN;
  const title = ui.title.value.trim();
  const headerMm = measureHeader(title, contentW);
  const blocks = buildBlocks(songs);
  const layout = findLayout(blocks, pages, contentW, contentH, headerMm);
  const pagesUsed = Math.max(1, Math.ceil(layout.columns.length / layout.cols));

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
    const rules = layout.cols > 1
      ? Array.from({ length: layout.cols - 1 }, (_, c) => {
          const x = MARGIN + (c + 1) * layout.columnMm + c * COLUMN_GAP + COLUMN_GAP / 2;
          const top = MARGIN + (p === 0 ? headerMm : 0);
          return `<div class="sheet-rule" style="left:${x}mm;top:${top}mm;bottom:${MARGIN}mm"></div>`;
        }).join('')
      : '';
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
  if (!layout.fits) {
    ui.fit.className = 'fit warn';
    ui.fit.textContent = `These songs don’t fit on ${pageWord(pages)}, even with the smallest text. They need ${pageWord(pagesUsed)}, so add pages or remove songs.`;
  } else if (pagesUsed < pages) {
    ui.fit.className = 'fit';
    ui.fit.textContent = `Everything fits on ${pageWord(pagesUsed)} at the largest text size (${details}).`;
  } else {
    ui.fit.className = 'fit';
    ui.fit.textContent = `Fits on ${pageWord(pagesUsed)}: ${details}.`;
  }
}

// Shrink the on-screen preview to fit the window; printing always uses the real size.
function scalePreview() {
  if (!lastLayout) return;
  const available = ui.out.parentElement.clientWidth - 2;
  const scale = Math.min(1, available / (lastLayout.w * pxPerMm));
  ui.out.style.zoom = scale;
}

// ---- Controls ----

let timer;
const scheduleUpdate = () => {
  clearTimeout(timer);
  timer = setTimeout(update, 150);
};

[ui.size, ui.orient, ui.cols].forEach((el) => el.addEventListener('change', update));
ui.pages.addEventListener('input', scheduleUpdate);
ui.pages.addEventListener('change', () => { ui.pages.value = clampPages(ui.pages.value); update(); });
ui.title.addEventListener('input', scheduleUpdate);
$('#fewer').addEventListener('click', () => { ui.pages.value = clampPages(+ui.pages.value - 1); update(); });
$('#more').addEventListener('click', () => { ui.pages.value = clampPages(+ui.pages.value + 1); update(); });
$('#print').addEventListener('click', () => window.print());
$('#copy').addEventListener('click', async (e) => {
  const button = e.currentTarget;
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
  update();
});

// ---- Start ----

const linkSongs = readSettings();
measurePxPerMm();
fetch('songs.json', { cache: 'no-cache' })
  .then((r) => r.json())
  .then((data) => {
    songsBySlug = Object.fromEntries(data.map((s) => [s.slug, s]));
    // A shared link brings its own songs; otherwise use the songs picked in this browser.
    picked = linkSongs.length ? linkSongs.filter((slug) => songsBySlug[slug]) : SongSelection.all().filter((slug) => songsBySlug[slug]);
    if (linkSongs.length) SongSelection.set(picked);
    // Wait for fonts so measurements match what gets printed.
    return document.fonts ? document.fonts.ready : null;
  })
  .then(update)
  .catch(() => {
    ui.fit.className = 'fit warn';
    ui.fit.textContent = 'Couldn’t load the songs. Check your connection and reload the page.';
  });
