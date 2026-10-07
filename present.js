// Presenting the slides from the browser, without PowerPoint.
// "Present" shows the slides full screen in this window (also on phones and tablets).
// "Presenter view" opens an audience window for the projector or TV, and keeps the controls, the
// next slide and the words of every slide in this window. The two windows talk over a
// BroadcastChannel, so they have to be in the same browser on the same computer.
// Uses the slides laid out by slides.js (deck, fullSlideHtml, captionSlideHtml).

(function () {
  const CHANNEL = 'lyrics-present';
  const IDLE_MS = 2500; // hide the controls after this long without moving the mouse
  const q = (sel) => document.querySelector(sel);
  const single = { root: q('#present'), stage: q('#present-stage'), count: q('#present-count') };
  const presenter = {
    root: q('#presenter'),
    current: q('#presenter-current'),
    next: q('#presenter-next'),
    list: q('#presenter-list'),
    count: q('#presenter-count'),
    blank: q('#presenter-blank'),
    status: q('#presenter-status'),
    timer: q('#presenter-timer'),
    clock: q('#presenter-clock'),
  };

  let show = null; // the slides being presented: { mode, w, h, slides, texts, kinds, background, index, blank }
  let channel = null;
  let startedAt = 0;
  let clockTimer = null;
  let idleTimer = null;
  let wakeLock = null;
  let wentFullScreen = false;

  const slideHtml = (slide) => (deck.captions ? captionSlideHtml(slide, deck) : fullSlideHtml(slide, deck));
  // Transparent subtitles are shown on black: a screen can't be see-through.
  const background = () => (deck.captions ? (deck.caption.transparent ? '#000' : `#${deck.caption.bg}`) : `#${deck.full.bg}`);

  function start(mode) {
    if (!deck || !deck.slides.length) return;
    show = {
      mode,
      w: deck.w,
      h: deck.h,
      slides: deck.slides.map(slideHtml),
      texts: deck.slides.map((slide) => slide.lines.join(' / ')),
      kinds: deck.slides.map((slide) => slide.kind),
      background: background(),
      index: 0,
      blank: false,
    };
    document.body.classList.add('is-presenting');
    navigator.wakeLock?.request('screen').then((lock) => { wakeLock = lock; }, () => {});
    if (mode === 'single') {
      single.root.hidden = false;
      single.stage.style.background = show.background;
      wentFullScreen = false;
      single.root.requestFullscreen?.().then(() => { wentFullScreen = true; }, () => {});
      showControls();
    } else {
      presenter.root.hidden = false;
      presenter.next.style.aspectRatio = `${show.w} / ${show.h}`;
      presenter.current.style.background = show.background;
      presenter.next.style.background = show.background;
      presenter.list.innerHTML = show.texts
        .map((text, i) => `<li><button type="button" data-goto="${i}" class="${show.kinds[i] === 'title' ? 'is-title' : ''}"><span class="num">${i + 1}</span><span>${escapeHtml(text)}</span></button></li>`)
        .join('');
      startedAt = Date.now();
      tick();
      clockTimer = setInterval(tick, 1000);
      openAudience();
    }
    render();
  }

  function stop() {
    if (!show) return;
    channel?.postMessage({ type: 'end' });
    show = null;
    single.root.hidden = true;
    presenter.root.hidden = true;
    document.body.classList.remove('is-presenting');
    clearInterval(clockTimer);
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  function go(index) {
    show.index = Math.max(0, Math.min(show.slides.length - 1, index));
    show.blank = false;
    render();
  }

  function act(action) {
    if (!show) return;
    if (action === 'next') go(show.index + 1);
    else if (action === 'prev') go(show.index - 1);
    else if (action === 'first') go(0);
    else if (action === 'last') go(show.slides.length - 1);
    else if (action === 'blank') {
      show.blank = !show.blank;
      render();
    } else if (action === 'exit') stop();
  }

  function render() {
    if (!show) return;
    const { index, slides, w, h, blank } = show;
    const count = `${index + 1} / ${slides.length}`;
    if (show.mode === 'single') {
      fitSlide(single.stage, blank ? '' : slides[index], w, h);
      single.count.textContent = blank ? 'Blank' : count;
      return;
    }
    fitSlide(presenter.current, slides[index], w, h);
    presenter.current.classList.toggle('is-blank', blank);
    fitSlide(presenter.next, slides[index + 1] || '<p class="present-end">End of the slides</p>', w, h);
    presenter.count.textContent = count;
    presenter.blank.textContent = blank ? 'Show the slide (B)' : 'Blank screen (B)';
    presenter.blank.classList.toggle('primary', blank);
    presenter.list.querySelectorAll('button').forEach((button, i) => {
      button.classList.toggle('is-current', i === index);
      if (i === index) button.scrollIntoView({ block: 'nearest' });
    });
    channel?.postMessage({ type: 'show', index, blank });
  }

  // ---- The audience window ----

  function openAudience() {
    if (!channel) {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = ({ data }) => {
        if (!show || show.mode !== 'presenter') return;
        if (data.type === 'hello') {
          channel.postMessage({ type: 'deck', w: show.w, h: show.h, slides: show.slides, background: show.background });
          channel.postMessage({ type: 'show', index: show.index, blank: show.blank });
          presenter.status.textContent = 'Audience screen is open';
        } else if (data.type === 'nav') act(data.action);
        else if (data.type === 'closed') presenter.status.textContent = 'Audience screen is closed';
      };
    }
    // The same ?v= as this page, so the audience window is the matching version of the site.
    const audience = window.open(`present.html${location.search}`, 'lyrics-audience', 'popup,width=960,height=540');
    presenter.status.textContent = audience
      ? 'Drag the audience window to the projector or TV, then click “Show full screen” in it.'
      : 'Your browser blocked the audience window. Allow pop-ups for this site, then click “Open audience screen”.';
  }

  function tick() {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    presenter.timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    presenter.clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ---- Controls ----

  function showControls() {
    single.root.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => single.root.classList.add('is-idle'), IDLE_MS);
  }

  document.querySelectorAll('.present-start').forEach((button) => {
    button.addEventListener('click', () => start(button.dataset.present));
  });
  [single.root, presenter.root].forEach((root) => root.addEventListener('click', (e) => {
    const button = e.target.closest('[data-act], [data-goto]');
    if (!button) return;
    e.stopPropagation();
    if (button.dataset.goto !== undefined) go(Number(button.dataset.goto));
    else act(button.dataset.act);
  }));
  q('#presenter-open').addEventListener('click', openAudience);
  presenter.timer.addEventListener('click', () => {
    startedAt = Date.now();
    tick();
  });

  // Single screen: tap the right of the screen (or swipe left) for the next slide, the left for the previous.
  let swipeFrom = null;
  single.stage.addEventListener('touchstart', (e) => { swipeFrom = e.touches[0].clientX; }, { passive: true });
  single.stage.addEventListener('touchend', (e) => {
    const distance = e.changedTouches[0].clientX - swipeFrom;
    if (Math.abs(distance) > 50) {
      act(distance < 0 ? 'next' : 'prev');
      swipeFrom = 'swiped';
    }
  });
  single.stage.addEventListener('click', (e) => {
    if (swipeFrom === 'swiped') {
      swipeFrom = null;
      return;
    }
    act(e.clientX < window.innerWidth / 3 ? 'prev' : 'next');
  });
  ['mousemove', 'touchstart'].forEach((type) => single.root.addEventListener(type, showControls, { passive: true }));

  document.addEventListener('keydown', (e) => {
    if (!show || e.target.closest('input, textarea, select')) return;
    if (e.key === 'Escape') {
      stop();
      return;
    }
    const action = PRESENT_KEYS[e.key];
    if (!action) return;
    e.preventDefault();
    act(action);
  });
  // Leaving full screen (e.g. with Esc) ends a single-screen presentation.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && show?.mode === 'single' && wentFullScreen) stop();
    else render();
  });
  window.addEventListener('resize', render);
})();
