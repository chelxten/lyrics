// Slides: turns the picked songs into a PowerPoint file or a set of PNG images, in two formats.
// "Full screen": each song starts with a title slide, then every verse gets its own slide. "Fit
// automatically" uses the largest text that keeps every verse whole on one slide; below
// MIN_WHOLE_FONT it splits long verses over two slides instead.
// "Subtitles": one or two lines per slide at the bottom of the screen, like captions, with each
// song's title as a caption first. "Fit automatically" uses the largest text that keeps every line
// on one line; below MIN_AUTO_CAPTION_FONT it lets long lines wrap instead.
// The song list and ✎ edits are shared with the song sheet (see setlist.js).

const SLIDE_SIZES = { wide: [13.333, 7.5], standard: [10, 7.5] }; // inches, PowerPoint's 16:9 and 4:3
const MARGIN = 0.5; // inches around the text
const PX_PER_IN = 96;
// Colors of links made before the color pickers: Colors ("theme") and the subtitle Background ("bg").
const OLD_THEMES = { dark: ['000000', 'ffffff'], light: ['ffffff', '111111'] };
const OLD_BACKGROUNDS = { black: '000000', green: '00b140' };
const CAPTION_SIDE = 0.6; // inches from the sides of the screen to the subtitle text
const CAPTION_BOTTOM = 0.4; // inches from the bottom of the screen to the subtitles
const CAPTION_PAD = 0.12; // inches of band above and below the subtitle text
const FONT_FACE = 'Myanmar Text'; // Burmese font that comes with Windows; other systems use their own
const LINE_HEIGHT = 1.5; // same as .slide-text in style.css
const MIN_FONT = 16; // pt
const MIN_WHOLE_FONT = 28; // pt, "Fit automatically" splits long verses rather than go smaller
const MAX_AUTO_FONT = 48; // pt, largest size "Fit automatically" will pick
const MIN_AUTO_CAPTION_FONT = 28; // pt, "Fit automatically" lets long lines wrap rather than go smaller
const MAX_AUTO_CAPTION_FONT = 40; // pt, largest subtitle size "Fit automatically" will pick
const MAX_FONT = 96; // pt, largest size that can be chosen by hand
const MANUAL_STEP = 2; // pt, one press of − / +
const TITLE_SCALE = 1.25; // full-screen title slides use bigger text than the verses
const SAFETY = 0.9; // PowerPoint's fonts differ a little from the browser's, so leave some room
const PNG_HEIGHT = 1080; // px, so 16:9 slides become 1920 × 1080 images
const PPTX_LABEL = 'Download PowerPoint';
const PNG_LABEL = 'Download PNGs';
const PPTX_LIBRARY = 'https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js';
const PPTX_LIBRARY_INTEGRITY = 'sha384-qb0Xhi7LLYpvW1HCK6oMrmDLSY9sy7vwm6ZlV6KjtrlL9yg30+YN4neTwnmX+Kp8';
const IMAGE_LIBRARY = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
const IMAGE_LIBRARY_INTEGRITY = 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H';
const ZIP_LIBRARY = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
const ZIP_LIBRARY_INTEGRITY = 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG';

const $ = (sel) => document.querySelector(sel);
const ui = {
  title: $('#deck-title'),
  formats: document.querySelectorAll('input[name="format"]'),
  size: $('#slide-size'),
  fullBg: $('#full-bg'),
  fullText: $('#full-text'),
  lines: $('#caption-lines'),
  textStyle: $('#caption-style'),
  captionText: $('#caption-text'),
  bandColor: $('#band-color'),
  bandOpacity: $('#band-opacity'),
  bandOpacityValue: $('#band-opacity-value'),
  outlineColor: $('#outline-color'),
  captionBg: $('#caption-bg'),
  transparent: $('#caption-transparent'),
  fontSize: $('#font-size'),
  autoFont: $('#auto-font'),
  labels: $('#labels'),
  bibleLang: $('#bible-lang'),
  biblePer: $('#bible-per'),
  fit: $('#fit'),
  out: $('#slides-out'),
  measure: $('#measure'),
  pptxButtons: document.querySelectorAll('.download-pptx'),
  pngButtons: document.querySelectorAll('.download-png'),
};

const { escapeHtml, burmeseNumber } = SetList;
let manualFont = null; // pt, or null for "Fit automatically"
let lastFont = 40; // size used by the latest layout
let deck = null; // the latest layout, used for the downloads
let viewOnly = false; // opened from a shared link: show only the slides

const clampFont = (n) => Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(n / MANUAL_STEP) * MANUAL_STEP));
const slideFont = (slide, font) => (slide.kind === 'verse' ? font : Math.round(font * TITLE_SCALE));
const currentFormat = () => [...ui.formats].find((input) => input.checked)?.value || 'full';
const setFormat = (value) => ui.formats.forEach((input) => { input.checked = input.value === value; });
const isCaptions = () => currentFormat() === 'captions';

// ---- Settings and the share link ----

function readSettings() {
  const params = new URLSearchParams(location.hash.slice(1));
  const saved = SetList.storageGet('lyrics-slides-settings', {});
  const pick = (key, fallback) => params.get(key) ?? saved[key] ?? fallback;
  setFormat(pick('format', 'full') === 'captions' ? 'captions' : 'full');
  ui.size.value = SLIDE_SIZES[pick('size', 'wide')] ? pick('size', 'wide') : 'wide';
  ui.lines.value = pick('lines', '2') === '1' ? '1' : '2';
  ui.textStyle.value = pick('style', 'band') === 'outline' ? 'outline' : 'band';
  // Colors are saved as hex without the #, e.g. 000000.
  const color = (key, fallback) => {
    const value = String(pick(key, fallback)).replace(/^#/, '').toLowerCase();
    return `#${/^[0-9a-f]{6}$/.test(value) ? value : fallback}`;
  };
  const oldTheme = OLD_THEMES[pick('theme', '')];
  const oldBackground = pick('bg', '');
  ui.fullBg.value = color('fbg', oldTheme ? oldTheme[0] : '000000');
  ui.fullText.value = color('ftext', oldTheme ? oldTheme[1] : 'ffffff');
  ui.captionText.value = color('ctext', 'ffffff');
  ui.bandColor.value = color('band', '000000');
  ui.bandOpacity.value = Math.min(100, Math.max(0, parseInt(pick('bandop', '60'), 10) || 0));
  ui.outlineColor.value = color('outline', '000000');
  ui.captionBg.value = color('cbg', OLD_BACKGROUNDS[oldBackground] || '000000');
  ui.transparent.checked = pick('transparent', oldBackground && oldBackground !== 'transparent' ? '0' : '1') !== '0';
  ui.labels.checked = pick('labels', '0') === '1';
  ui.bibleLang.value = ['my', 'en', 'both'].includes(pick('blang', 'my')) ? pick('blang', 'my') : 'my';
  ui.biblePer.value = pick('bper', '1') === '2' ? '2' : '1';
  ui.title.value = params.get('title') ?? '';
  const font = params.get('font');
  manualFont = font && font !== 'auto' ? clampFont(parseFloat(font)) : null;
  viewOnly = params.get('view') === '1';
  return { songs: params.getAll('s'), edits: params.get('edits'), viewOnly };
}

function saveSettings() {
  const params = new URLSearchParams();
  SetList.slugs().forEach((slug) => params.append('s', slug));
  const settings = {
    format: currentFormat(),
    size: ui.size.value,
    lines: ui.lines.value,
    style: ui.textStyle.value,
    fbg: ui.fullBg.value.slice(1),
    ftext: ui.fullText.value.slice(1),
    ctext: ui.captionText.value.slice(1),
    band: ui.bandColor.value.slice(1),
    bandop: ui.bandOpacity.value,
    outline: ui.outlineColor.value.slice(1),
    cbg: ui.captionBg.value.slice(1),
    transparent: ui.transparent.checked ? '1' : '0',
    labels: ui.labels.checked ? '1' : '0',
    blang: ui.bibleLang.value,
    bper: ui.biblePer.value,
  };
  Object.entries(settings).forEach(([key, value]) => params.set(key, value));
  params.set('font', manualFont ?? 'auto');
  if (ui.title.value.trim()) params.set('title', ui.title.value.trim());
  if (SetList.encodedEdits()) params.set('edits', SetList.encodedEdits());
  if (viewOnly) params.set('view', '1');
  history.replaceState(null, '', `#${params}`);
  if (!viewOnly) SetList.storageSet('lyrics-slides-settings', settings);
}

// Show the settings that belong to the chosen format.
function showFormatControls() {
  const band = ui.textStyle.value === 'band';
  document.querySelectorAll('.full-only').forEach((el) => { el.hidden = isCaptions(); });
  document.querySelectorAll('.caption-only').forEach((el) => { el.hidden = !isCaptions(); });
  // Band and outline settings belong to subtitles only.
  document.querySelectorAll('.band-only').forEach((el) => { el.hidden = !isCaptions() || !band; });
  document.querySelectorAll('.outline-only').forEach((el) => { el.hidden = !isCaptions() || band; });
  ui.bandOpacityValue.textContent = `${ui.bandOpacity.value}%`;
  document.querySelectorAll('.site-nav [data-format]').forEach((link) => {
    if (link.dataset.format === currentFormat()) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

const hex = (input) => input.value.slice(1).toUpperCase(); // #aabbcc -> AABBCC, as PowerPoint wants
const rgba = (color, opacity) => `rgba(${[0, 2, 4].map((i) => parseInt(color.slice(i, i + 2), 16)).join(', ')}, ${opacity})`;

// ---- Full screen: an optional title slide, then per song a title slide and one slide per verse ----

function buildSlides(songs) {
  const slides = [];
  const title = ui.title.value.trim();
  if (title) slides.push({ kind: 'title', lines: [title] });
  let number = 0;
  songs.forEach((song) => {
    // A Bible passage: its verses, with the reference in the corner of each slide.
    if (song.kind === 'bible') {
      slides.push(...bibleSlides(song));
      return;
    }
    number += 1;
    slides.push({ kind: 'title', lines: [`${burmeseNumber(number)}။ ${song.title}`] });
    SetList.verses(song, ui.labels.checked).forEach((lines) => slides.push({ kind: 'verse', lines }));
  });
  return slides;
}

// A Bible passage as verse slides: "Verses per slide" verses each, in the chosen language(s).
function bibleSlides(passage) {
  const lang = ui.bibleLang.value;
  const perSlide = Number(ui.biblePer.value);
  const slides = [];
  for (let i = 0; i < passage.verses.length; i += perSlide) {
    const verses = passage.verses.slice(i, i + perSlide);
    slides.push({
      kind: 'verse',
      lines: verses.flatMap((verse) => Bible.verseLines(verse, lang, passage.ref)),
      footer: Bible.label(Bible.part(passage.ref, verses), lang),
    });
  }
  return slides;
}

let measuredHtml = '';
function setMeasureHtml(html) {
  if (html === measuredHtml) return;
  ui.measure.innerHTML = html;
  measuredHtml = html;
}

// The height (px) of every line of every verse at this text size, wrapping as it does on a slide.
function measureLines(slides, widthPx, fontPt) {
  setMeasureHtml(slides
    .filter((slide) => slide.kind === 'verse')
    .map((slide) => `<div>${slide.lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`)
    .join(''));
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
        out.push({ ...slide, lines: part });
        split = true;
        part = [];
        used = 0;
      }
      part.push(line);
      used += lineHeights[i];
    });
    out.push({ ...slide, lines: part });
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

// ---- Subtitles: an optional title caption, then per song a title caption and its lines ----

function buildCaptions(songs) {
  const perSlide = Number(ui.lines.value);
  const captions = [];
  const title = ui.title.value.trim();
  if (title) captions.push({ kind: 'title', lines: [title] });
  let number = 0;
  songs.forEach((song) => {
    // A Bible passage: its reference first, then its verses.
    if (song.kind === 'bible') {
      captions.push({ kind: 'title', lines: [Bible.label(song.ref, ui.bibleLang.value)] });
      bibleSlides(song).forEach(({ lines }) => captions.push({ kind: 'verse', lines }));
      return;
    }
    number += 1;
    captions.push({ kind: 'title', lines: [`${burmeseNumber(number)}။ ${song.title}`] });
    for (const verse of SetList.verses(song, ui.labels.checked)) {
      for (let i = 0; i < verse.length; i += perSlide) captions.push({ kind: 'verse', lines: verse.slice(i, i + perSlide) });
    }
  });
  return captions;
}

// The widest line (px) when no line wraps, and each caption's height when lines wrap at widthPx.
function measureCaptions(captions, widthPx, fontPt) {
  setMeasureHtml(captions
    .map((c) => `<div class="${c.kind === 'title' ? 'is-title' : ''}">${c.lines.map((line) => `<div><span>${escapeHtml(line)}</span></div>`).join('')}</div>`)
    .join(''));
  ui.measure.style.fontSize = `${fontPt}pt`;
  ui.measure.style.width = 'max-content';
  const widest = Math.max(...[...ui.measure.querySelectorAll('span')].map((span) => span.getBoundingClientRect().width));
  ui.measure.style.width = `${widthPx}px`;
  const heights = [...ui.measure.children].map((caption) => caption.getBoundingClientRect().height);
  return { widest, heights };
}

function captionLayout(captions, w) {
  const widthPx = (w - 2 * CAPTION_SIDE) * PX_PER_IN;
  const fitsOnOneLine = (f) => measureCaptions(captions, widthPx, f).widest <= widthPx * SAFETY;
  let font = manualFont;
  if (font === null) {
    font = MIN_AUTO_CAPTION_FONT;
    if (fitsOnOneLine(font)) {
      let lo = MIN_AUTO_CAPTION_FONT;
      let hi = MAX_AUTO_CAPTION_FONT;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fitsOnOneLine(mid)) lo = mid;
        else hi = mid - 1;
      }
      font = lo;
    }
  }
  const { widest, heights } = measureCaptions(captions, widthPx, font);
  // Each caption's band fits its own text, and grows upwards from the bottom.
  const slides = captions.map((caption, i) => ({ ...caption, bandPx: heights[i] + 2 * CAPTION_PAD * PX_PER_IN }));
  return { font, slides, wraps: widest > widthPx * SAFETY };
}

// ---- Rendering ----

const px = (inches) => inches * PX_PER_IN;

function fullSlideHtml(slide, { w, h, font, full }) {
  return `
    <div class="slide slide-text" style="width:${px(w)}px;height:${px(h)}px;padding:${px(MARGIN)}px;background:#${full.bg};color:#${full.text};font-size:${slideFont(slide, font)}pt">
      <div class="slide-body${slide.kind === 'title' ? ' is-title' : ''}">${slide.lines.map(escapeHtml).join('\n')}</div>
      ${slide.footer ? `<div class="slide-ref" style="font-size:${footerFont(font)}pt">${escapeHtml(slide.footer)}</div>` : ''}
    </div>`;
}

// The reference in the corner of Bible slides.
const footerFont = (font) => Math.max(16, Math.round(font * 0.55));

function captionSlideHtml(slide, { w, h, font, caption: c }) {
  return `
    <div class="slide slide-text caption-slide ${c.band ? 'has-band' : 'has-outline'}" style="width:${px(w)}px;height:${px(h)}px;background:${c.transparent ? 'transparent' : `#${c.bg}`};color:#${c.text};--outline:#${c.outline};font-size:${font}pt">
      <div class="caption" style="bottom:${px(CAPTION_BOTTOM)}px;height:${slide.bandPx}px;padding:0 ${px(CAPTION_SIDE)}px${c.band ? `;background:${rgba(c.bandColor, c.bandOpacity)}` : ''}">
        <div class="caption-text${slide.kind === 'title' ? ' is-title' : ''}">${slide.lines.map(escapeHtml).join('\n')}</div>
      </div>
    </div>`;
}

function setButtons(buttons, busyText, label) {
  buttons.forEach((button) => {
    button.disabled = Boolean(busyText) || !deck;
    button.textContent = busyText || label;
  });
}

function update() {
  saveSettings();
  SetList.render();
  showFormatControls();
  const songs = SetList.songs();
  document.querySelectorAll('.bible-only').forEach((el) => { el.hidden = !songs.some((song) => song.kind === 'bible'); });
  ui.autoFont.checked = manualFont === null;

  if (!songs.length) {
    ui.out.innerHTML = viewOnly ? '<p class="muted">These slides have no songs.</p>' : '';
    ui.fit.textContent = '';
    ui.fontSize.textContent = manualFont ? `${manualFont} pt` : 'Auto';
    deck = null;
    setButtons(ui.pptxButtons, null, PPTX_LABEL);
    setButtons(ui.pngButtons, null, PNG_LABEL);
    document.querySelectorAll('.present-start').forEach((button) => { button.disabled = true; });
    return;
  }

  const [w, h] = SLIDE_SIZES[ui.size.value];
  const captions = isCaptions();
  const result = captions ? captionLayout(buildCaptions(songs), w) : layout(buildSlides(songs), w, h);
  lastFont = result.font;
  ui.fontSize.textContent = `${result.font} pt`;
  deck = {
    w,
    h,
    captions,
    font: result.font,
    slides: result.slides,
    full: { bg: hex(ui.fullBg), text: hex(ui.fullText) },
    caption: {
      band: ui.textStyle.value === 'band',
      text: hex(ui.captionText),
      bandColor: hex(ui.bandColor),
      bandOpacity: Number(ui.bandOpacity.value) / 100,
      outline: hex(ui.outlineColor),
      bg: hex(ui.captionBg),
      transparent: ui.transparent.checked,
    },
  };
  setButtons(ui.pptxButtons, null, PPTX_LABEL);
  setButtons(ui.pngButtons, null, PNG_LABEL);
  document.querySelectorAll('.present-start').forEach((button) => { button.disabled = false; });

  const transparent = captions && ui.transparent.checked;
  ui.out.innerHTML = result.slides
    .map((slide, i) => `
      <figure class="slide-item">
        <div class="slide-frame${transparent ? ' is-transparent' : ''}" style="aspect-ratio:${w} / ${h}">
          ${captions ? captionSlideHtml(slide, deck) : fullSlideHtml(slide, deck)}
        </div>
        <figcaption>${i + 1}</figcaption>
      </figure>`)
    .join('');
  scalePreview();

  const count = `${result.slides.length} ${result.slides.length === 1 ? 'slide' : 'slides'}`;
  let note = '';
  if (result.split) note += ' Some verses are too long for one slide at this size, so they continue on the next slide.';
  if (result.wraps) note += ' Some lines are too long for one line at this size, so they wrap.';
  if (transparent) note += ' PowerPoint slides can’t be transparent, so the presentation uses the background color; the PNGs are transparent.';
  ui.fit.className = 'fit';
  ui.fit.textContent = `${count}, text size ${result.font} pt.${note}`;
}

// Shrink the slide previews to fit their boxes; the downloads always use the real size.
function scalePreview() {
  if (!deck) return;
  const frames = ui.out.querySelectorAll('.slide-frame');
  if (!frames.length) return;
  const scale = frames[0].clientWidth / px(deck.w);
  frames.forEach((frame) => { frame.firstElementChild.style.transform = `scale(${scale})`; });
}

function showError(message) {
  ui.fit.className = 'fit warn';
  ui.fit.textContent = message;
  if (viewOnly) alert(message);
}

// ---- PowerPoint ----

const loadLibrary = () => SetList.loadScript(PPTX_LIBRARY, PPTX_LIBRARY_INTEGRITY, 'PptxGenJS');
const fileName = () => SetList.fileName(ui.title.value, 'Songs');
const textRuns = (lines) => lines.map((text, i) => ({ text, options: { breakLine: i < lines.length - 1 } }));

function addFullSlide(s, slide, { w, h, font, full }) {
  const size = slideFont(slide, font);
  s.background = { color: full.bg };
  s.addText(textRuns(slide.lines), {
    x: MARGIN,
    y: MARGIN,
    w: w - 2 * MARGIN,
    h: h - 2 * MARGIN,
    margin: 0,
    fontFace: FONT_FACE,
    fontSize: size,
    bold: slide.kind === 'title',
    color: full.text,
    align: 'center',
    valign: 'middle',
    lineSpacing: size * LINE_HEIGHT,
    fit: 'shrink',
  });
  if (slide.footer) {
    s.addText(slide.footer, {
      x: MARGIN,
      y: h - MARGIN + 0.05,
      w: w - 2 * MARGIN,
      h: MARGIN - 0.1,
      margin: 0,
      fontFace: FONT_FACE,
      fontSize: footerFont(font),
      color: full.text,
      align: 'right',
      valign: 'middle',
    });
  }
}

function addCaptionSlide(pptx, s, slide, { w, h, font, caption: c }) {
  const bandH = slide.bandPx / PX_PER_IN;
  const y = h - CAPTION_BOTTOM - bandH;
  s.background = { color: c.bg }; // also when "Transparent" is ticked: PowerPoint slides can't be transparent
  if (c.band) {
    s.addShape(pptx.ShapeType.rect, { x: 0, y, w, h: bandH, fill: { color: c.bandColor, transparency: Math.round((1 - c.bandOpacity) * 100) } });
  }
  s.addText(textRuns(slide.lines), {
    x: CAPTION_SIDE,
    y,
    w: w - 2 * CAPTION_SIDE,
    h: bandH,
    margin: 0,
    fontFace: FONT_FACE,
    fontSize: font,
    bold: slide.kind === 'title',
    color: c.text,
    align: 'center',
    valign: 'middle',
    lineSpacing: font * LINE_HEIGHT,
    ...(c.band ? {} : { outline: { size: 1.5, color: c.outline } }),
  });
}

async function downloadPowerPoint() {
  if (!deck) return;
  const current = deck;
  setButtons(ui.pptxButtons, 'Making PowerPoint…');
  try {
    const PptxGenJS = await loadLibrary();
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'LYRICS', width: current.w, height: current.h });
    pptx.layout = 'LYRICS';
    pptx.title = ui.title.value.trim() || 'Songs';
    for (const slide of current.slides) {
      const s = pptx.addSlide();
      if (current.captions) addCaptionSlide(pptx, s, slide, current);
      else addFullSlide(s, slide, current);
    }
    await pptx.writeFile({ fileName: `${fileName()}.pptx` });
  } catch {
    showError('Couldn’t make the PowerPoint. Check your connection and try again.');
  } finally {
    setButtons(ui.pptxButtons, null, PPTX_LABEL);
  }
}

// ---- PNG images: one per slide, in a zip ----

async function downloadImages() {
  if (!deck) return;
  const slides = [...ui.out.querySelectorAll('.slide')];
  setButtons(ui.pngButtons, 'Making PNGs…');
  try {
    const [html2canvas, JSZip] = await Promise.all([
      SetList.loadScript(IMAGE_LIBRARY, IMAGE_LIBRARY_INTEGRITY, 'html2canvas'),
      SetList.loadScript(ZIP_LIBRARY, ZIP_LIBRARY_INTEGRITY, 'JSZip'),
    ]);
    const zip = new JSZip();
    const scale = PNG_HEIGHT / px(deck.h);
    for (const [i, slide] of slides.entries()) {
      setButtons(ui.pngButtons, `Making PNGs… ${i + 1} / ${slides.length}`);
      const canvas = await html2canvas(slide, {
        scale,
        backgroundColor: null, // keeps transparent backgrounds transparent
        logging: false,
        // Draw the slide at its real size, not the shrunk preview.
        onclone: (doc, clone) => {
          clone.style.transform = 'none';
          for (let el = clone.parentElement; el; el = el.parentElement) el.style.overflow = 'visible';
        },
      });
      zip.file(`${String(i + 1).padStart(3, '0')}.png`, await new Promise((resolve) => canvas.toBlob(resolve, 'image/png')));
    }
    SetList.saveFile(await zip.generateAsync({ type: 'blob' }), `${fileName()} (PNG).zip`);
  } catch {
    showError('Couldn’t make the PNGs. Check your connection and try again.');
  } finally {
    setButtons(ui.pngButtons, null, PNG_LABEL);
  }
}

// ---- Controls ----

let timer;
function scheduleUpdate() {
  clearTimeout(timer);
  timer = setTimeout(update, 150);
}

[ui.size, ui.lines, ui.textStyle, ui.transparent, ui.labels, ui.bibleLang, ui.biblePer].forEach((el) => el.addEventListener('change', update));
// Colors and the band opacity redraw while they're being picked or dragged.
[ui.fullBg, ui.fullText, ui.captionText, ui.bandColor, ui.bandOpacity, ui.outlineColor, ui.captionBg].forEach((el) => {
  el.addEventListener('input', () => {
    ui.bandOpacityValue.textContent = `${ui.bandOpacity.value}%`;
    scheduleUpdate();
  });
  el.addEventListener('change', update);
});
// Each format has its own automatic text size.
ui.formats.forEach((input) => input.addEventListener('change', () => {
  manualFont = null;
  update();
}));
// The menu's PowerPoint and Subtitles links only change the address's #format while on this page.
window.addEventListener('hashchange', () => {
  const format = new URLSearchParams(location.hash.slice(1)).get('format');
  if (!format || format === currentFormat()) return;
  setFormat(format === 'captions' ? 'captions' : 'full');
  manualFont = null;
  update();
});
ui.title.addEventListener('input', scheduleUpdate);

// − / + switch to a chosen size, starting from the size currently shown.
$('#smaller').addEventListener('click', () => { manualFont = clampFont((manualFont ?? lastFont) - MANUAL_STEP); update(); });
$('#bigger').addEventListener('click', () => { manualFont = clampFont((manualFont ?? lastFont) + MANUAL_STEP); update(); });
ui.autoFont.addEventListener('change', () => {
  manualFont = ui.autoFont.checked ? null : clampFont(lastFont);
  update();
});

ui.pptxButtons.forEach((button) => button.addEventListener('click', downloadPowerPoint));
ui.pngButtons.forEach((button) => button.addEventListener('click', downloadImages));

// "Copy link" gives a link that opens just the slides, without the controls.
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
SetList.start(fromLink, { update, scheduleUpdate, saveSettings })
  .then(update)
  .catch(() => showError('Couldn’t load the songs. Check your connection and reload the page.'));
