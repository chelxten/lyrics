// Slides: turns the picked songs into a PowerPoint file. Each song starts with a title slide, then
// every verse gets its own slide. "Fit automatically" uses the largest text that keeps every verse
// whole on one slide; below MIN_WHOLE_FONT it splits long verses over two slides instead.
// The song list and ✎ edits are shared with the song sheet (see setlist.js).

const SLIDE_SIZES = { wide: [13.333, 7.5], standard: [10, 7.5] }; // inches, PowerPoint's 16:9 and 4:3
const MARGIN = 0.5; // inches around the text
const PX_PER_IN = 96;
const THEMES = { dark: { bg: '000000', text: 'FFFFFF' }, light: { bg: 'FFFFFF', text: '111111' } };
const FONT_FACE = 'Myanmar Text'; // Burmese font that comes with Windows; other systems use their own
const LINE_HEIGHT = 1.5; // same as .slide-text in style.css
const MIN_FONT = 16; // pt
const MIN_WHOLE_FONT = 28; // pt, "Fit automatically" splits long verses rather than go smaller
const MAX_AUTO_FONT = 48; // pt, largest size "Fit automatically" will pick
const MAX_FONT = 96; // pt, largest size that can be chosen by hand
const MANUAL_STEP = 2; // pt, one press of − / +
const TITLE_SCALE = 1.25; // title slides use bigger text than the verses
const SAFETY = 0.9; // PowerPoint's fonts differ a little from the browser's, so leave some room
const PPTX_LIBRARY = 'https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js';
const PPTX_LIBRARY_INTEGRITY = 'sha384-qb0Xhi7LLYpvW1HCK6oMrmDLSY9sy7vwm6ZlV6KjtrlL9yg30+YN4neTwnmX+Kp8';

const $ = (sel) => document.querySelector(sel);
const ui = {
  title: $('#deck-title'),
  size: $('#slide-size'),
  theme: $('#theme'),
  fontSize: $('#font-size'),
  autoFont: $('#auto-font'),
  labels: $('#labels'),
  fit: $('#fit'),
  out: $('#slides-out'),
  measure: $('#measure'),
  download: $('#download'),
};

const { escapeHtml, burmeseNumber } = SetList;
let manualFont = null; // pt, or null for "Fit automatically"
let lastFont = 40; // size used by the latest layout
let deck = null; // the latest layout, used for the download

const clampFont = (n) => Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(n / MANUAL_STEP) * MANUAL_STEP));
const slideFont = (slide, font) => (slide.kind === 'verse' ? font : Math.round(font * TITLE_SCALE));

// ---- Settings and the share link ----

function readSettings() {
  const params = new URLSearchParams(location.hash.slice(1));
  const saved = SetList.storageGet('lyrics-slides-settings', {});
  const pick = (key, fallback) => params.get(key) ?? saved[key] ?? fallback;
  ui.size.value = SLIDE_SIZES[pick('size', 'wide')] ? pick('size', 'wide') : 'wide';
  ui.theme.value = THEMES[pick('theme', 'dark')] ? pick('theme', 'dark') : 'dark';
  ui.labels.checked = pick('labels', '0') === '1';
  ui.title.value = params.get('title') ?? '';
  const font = params.get('font');
  manualFont = font && font !== 'auto' ? clampFont(parseFloat(font)) : null;
  return { songs: params.getAll('s'), edits: params.get('edits') };
}

function saveSettings() {
  const params = new URLSearchParams();
  SetList.slugs().forEach((slug) => params.append('s', slug));
  params.set('size', ui.size.value);
  params.set('theme', ui.theme.value);
  params.set('font', manualFont ?? 'auto');
  params.set('labels', ui.labels.checked ? '1' : '0');
  if (ui.title.value.trim()) params.set('title', ui.title.value.trim());
  if (SetList.encodedEdits()) params.set('edits', SetList.encodedEdits());
  history.replaceState(null, '', `#${params}`);
  SetList.storageSet('lyrics-slides-settings', { size: ui.size.value, theme: ui.theme.value, labels: ui.labels.checked ? '1' : '0' });
}

// ---- Slides: an optional title slide, then per song a title slide and one slide per verse ----

function buildSlides(songs) {
  const slides = [];
  const title = ui.title.value.trim();
  if (title) slides.push({ kind: 'title', lines: [title] });
  songs.forEach((song, n) => {
    slides.push({ kind: 'title', lines: [`${burmeseNumber(n + 1)}။ ${song.title}`] });
    SetList.verses(song, ui.labels.checked).forEach((lines) => slides.push({ kind: 'verse', lines }));
  });
  return slides;
}

// ---- Measuring and fitting ----

let measuredHtml = '';
// The height (px) of every line of every verse at this text size, wrapping as it does on a slide.
function measureLines(slides, widthPx, fontPt) {
  const html = slides
    .filter((slide) => slide.kind === 'verse')
    .map((slide) => `<div>${slide.lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`)
    .join('');
  if (html !== measuredHtml) {
    ui.measure.innerHTML = html;
    measuredHtml = html;
  }
  ui.measure.style.width = `${widthPx}px`;
  ui.measure.style.fontSize = `${fontPt}pt`;
  return [...ui.measure.children].map((verse) => [...verse.children].map((line) => line.getBoundingClientRect().height));
}

const sum = (list) => list.reduce((a, b) => a + b, 0);

// Splits verses that are too tall for a slide, carrying the rest on to the next slide.
function splitLongVerses(slides, heights, capacity) {
  const out = [];
  let split = false;
  let v = 0;
  for (const slide of slides) {
    if (slide.kind !== 'verse') {
      out.push(slide);
      continue;
    }
    const lineHeights = heights[v++];
    let part = [];
    let used = 0;
    slide.lines.forEach((line, i) => {
      if (part.length && used + lineHeights[i] > capacity) {
        out.push({ kind: 'verse', lines: part });
        split = true;
        part = [];
        used = 0;
      }
      part.push(line);
      used += lineHeights[i];
    });
    out.push({ kind: 'verse', lines: part });
  }
  return { slides: out, split };
}

function layout(slides, w, h) {
  const widthPx = (w - 2 * MARGIN) * PX_PER_IN;
  const capacity = (h - 2 * MARGIN) * PX_PER_IN * SAFETY;
  let font = manualFont;
  if (font === null) {
    const fitsWhole = (f) => measureLines(slides, widthPx, f).every((lines) => sum(lines) <= capacity);
    font = MIN_WHOLE_FONT;
    if (fitsWhole(font)) {
      let lo = MIN_WHOLE_FONT;
      let hi = MAX_AUTO_FONT;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fitsWhole(mid)) lo = mid;
        else hi = mid - 1;
      }
      font = lo;
    }
  }
  return { font, ...splitLongVerses(slides, measureLines(slides, widthPx, font), capacity) };
}

// ---- Rendering ----

function update() {
  saveSettings();
  SetList.render();
  const songs = SetList.songs();
  ui.autoFont.checked = manualFont === null;
  ui.download.disabled = !songs.length;

  if (!songs.length) {
    ui.out.innerHTML = '';
    ui.fit.textContent = '';
    ui.fontSize.textContent = manualFont ? `${manualFont} pt` : 'Auto';
    deck = null;
    return;
  }

  const [w, h] = SLIDE_SIZES[ui.size.value];
  const theme = THEMES[ui.theme.value];
  const result = layout(buildSlides(songs), w, h);
  lastFont = result.font;
  ui.fontSize.textContent = `${result.font} pt`;
  deck = { w, h, theme, font: result.font, slides: result.slides };

  ui.out.innerHTML = result.slides
    .map((slide, i) => `
      <figure class="slide-item">
        <div class="slide-frame" style="aspect-ratio:${w} / ${h}">
          <div class="slide slide-text" style="width:${w * PX_PER_IN}px;height:${h * PX_PER_IN}px;padding:${MARGIN * PX_PER_IN}px;background:#${theme.bg};color:#${theme.text};font-size:${slideFont(slide, result.font)}pt">
            <div class="slide-body${slide.kind === 'title' ? ' is-title' : ''}">${slide.lines.map(escapeHtml).join('\n')}</div>
          </div>
        </div>
        <figcaption>${i + 1}</figcaption>
      </figure>`)
    .join('');
  scalePreview();

  const count = `${result.slides.length} ${result.slides.length === 1 ? 'slide' : 'slides'}`;
  ui.fit.className = 'fit';
  ui.fit.textContent = `${count}, text size ${result.font} pt.${
    result.split ? ' Some verses are too long for one slide at this size, so they continue on the next slide.' : ''}`;
}

// Shrink the slide previews to fit their boxes; the PowerPoint file always uses the real size.
function scalePreview() {
  if (!deck) return;
  const frames = ui.out.querySelectorAll('.slide-frame');
  if (!frames.length) return;
  const scale = frames[0].clientWidth / (deck.w * PX_PER_IN);
  frames.forEach((frame) => { frame.firstElementChild.style.transform = `scale(${scale})`; });
}

// ---- PowerPoint ----

let library = null;
function loadLibrary() {
  library ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PPTX_LIBRARY;
    script.integrity = PPTX_LIBRARY_INTEGRITY;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve(window.PptxGenJS);
    script.onerror = () => {
      library = null;
      reject(new Error('Could not load the PowerPoint library'));
    };
    document.head.appendChild(script);
  });
  return library;
}

const fileName = () => (ui.title.value.trim() || 'Songs').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Songs';

async function downloadPowerPoint() {
  if (!deck) return;
  const { w, h, theme, font, slides } = deck;
  ui.download.disabled = true;
  ui.download.textContent = 'Making PowerPoint…';
  try {
    const PptxGenJS = await loadLibrary();
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'LYRICS', width: w, height: h });
    pptx.layout = 'LYRICS';
    pptx.title = ui.title.value.trim() || 'Songs';
    for (const slide of slides) {
      const size = slideFont(slide, font);
      const s = pptx.addSlide();
      s.background = { color: theme.bg };
      s.addText(
        slide.lines.map((text, i) => ({ text, options: { breakLine: i < slide.lines.length - 1 } })),
        {
          x: MARGIN,
          y: MARGIN,
          w: w - 2 * MARGIN,
          h: h - 2 * MARGIN,
          margin: 0,
          fontFace: FONT_FACE,
          fontSize: size,
          bold: slide.kind === 'title',
          color: theme.text,
          align: 'center',
          valign: 'middle',
          lineSpacing: size * LINE_HEIGHT,
          fit: 'shrink',
        },
      );
    }
    await pptx.writeFile({ fileName: `${fileName()}.pptx` });
  } catch {
    ui.fit.className = 'fit warn';
    ui.fit.textContent = 'Couldn’t make the PowerPoint. Check your connection and try again.';
  } finally {
    ui.download.disabled = !deck;
    ui.download.textContent = 'Download PowerPoint';
  }
}

// ---- Controls ----

let timer;
function scheduleUpdate() {
  clearTimeout(timer);
  timer = setTimeout(update, 150);
}

[ui.size, ui.theme, ui.labels].forEach((el) => el.addEventListener('change', update));
ui.title.addEventListener('input', scheduleUpdate);

// − / + switch to a chosen size, starting from the size currently shown.
$('#smaller').addEventListener('click', () => { manualFont = clampFont((manualFont ?? lastFont) - MANUAL_STEP); update(); });
$('#bigger').addEventListener('click', () => { manualFont = clampFont((manualFont ?? lastFont) + MANUAL_STEP); update(); });
ui.autoFont.addEventListener('change', () => {
  manualFont = ui.autoFont.checked ? null : clampFont(lastFont);
  update();
});

ui.download.addEventListener('click', downloadPowerPoint);
$('#copy').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  await SetList.flushEdits();
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

// ---- Start ----

const fromLink = readSettings();
SetList.start(fromLink, { update, scheduleUpdate, saveSettings })
  .then(update)
  .catch(() => {
    ui.fit.className = 'fit warn';
    ui.fit.textContent = 'Couldn’t load the songs. Check your connection and reload the page.';
  });
