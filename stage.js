// Draws one slide (HTML made by slides.js) centered in a box, as large as fits. Used by the
// slides page (present.js) and the audience window (present.html).
window.fitSlide = function fitSlide(box, html, w, h) {
  box.innerHTML = html || '';
  const slide = box.firstElementChild;
  if (!slide) return;
  const width = w * 96;
  const height = h * 96;
  const scale = Math.min(box.clientWidth / width, box.clientHeight / height);
  slide.style.transform = `translate(${(box.clientWidth - width * scale) / 2}px, ${(box.clientHeight - height * scale) / 2}px) scale(${scale})`;
};

// Keys that move through the slides. Clickers (presentation remotes) send these too.
window.PRESENT_KEYS = {
    ArrowRight: 'next', ArrowDown: 'next', PageDown: 'next', ' ': 'next', Enter: 'next', N: 'next', n: 'next',
    ArrowLeft: 'prev', ArrowUp: 'prev', PageUp: 'prev', Backspace: 'prev', P: 'prev', p: 'prev',
    Home: 'first', End: 'last', b: 'blank', B: 'blank', '.': 'blank', w: 'blank', W: 'blank',
  };
