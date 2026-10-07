// Songs picked for a song sheet or slides. Shared by the song list, the admin panel, sheet.html and slides.html,
// and stored only in this browser.
(function () {
  const KEY = 'lyrics-sheet-songs';
  const listeners = new Set();

  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(value) ? value.filter((s) => typeof s === 'string') : [];
    } catch {
      return [];
    }
  }

  let songs = read();

  function save(next) {
    songs = [...new Set(next)];
    try { localStorage.setItem(KEY, JSON.stringify(songs)); } catch {}
    listeners.forEach((fn) => fn(songs));
  }

  // Keep other open tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    songs = read();
    listeners.forEach((fn) => fn(songs));
  });

  function updateButton(button) {
    const on = songs.includes(button.dataset.slug);
    button.setAttribute('aria-pressed', on);
    button.title = on ? 'Remove from song sheet and slides' : 'Add to song sheet and slides';
    button.textContent = button.classList.contains('wide') ? (on ? '✓ In song sheet and slides' : '+ Add to song sheet and slides') : on ? '✓' : '+';
  }

  // One click handler for every pick button on the page, including ones rendered later.
  document.addEventListener('click', (e) => {
    const button = e.target.closest('.pick');
    if (!button) return;
    e.preventDefault();
    const slug = button.dataset.slug;
    save(songs.includes(slug) ? songs.filter((s) => s !== slug) : [...songs, slug]);
  });
  listeners.add(() => document.querySelectorAll('.pick').forEach(updateButton));

  window.SongSelection = {
    all: () => [...songs],
    set: save,
    onChange: (fn) => listeners.add(fn),

    // HTML for a +/✓ toggle button (escaped by the DOM). Pass wide = true for the labelled version.
    pickButton(slug, title, wide = false) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = wide ? 'pick wide' : 'pick';
      button.dataset.slug = slug;
      updateButton(button);
      button.setAttribute('aria-label', `Song sheet and slides: ${title}`);
      return button.outerHTML;
    },

    // Bar at the bottom of the page showing how many songs are picked.
    mountTray() {
      const tray = document.createElement('div');
      tray.className = 'sheet-tray';
      tray.innerHTML = `
        <span class="tray-info">
          <span class="count"></span>
          <button type="button" class="link-button">Clear</button>
        </span>
        <span class="tray-actions">
          <a class="tray-button" href="sheet.html">Song sheet<span class="wide-only"> →</span></a>
          <a class="tray-button" href="slides.html#format=full">PowerPoint<span class="wide-only"> →</span></a>
          <a class="tray-button" href="slides.html#format=captions">Subtitles<span class="wide-only"> →</span></a>
        </span>`;
      tray.querySelector('button').addEventListener('click', () => {
        if (confirm('Remove all picked songs?')) save([]);
      });
      document.body.appendChild(tray);
      const update = () => {
        tray.hidden = !songs.length;
        document.body.classList.toggle('has-tray', songs.length > 0);
        tray.querySelector('.count').innerHTML = `<b>${songs.length}</b> in your set`;
      };
      listeners.add(update);
      update();
    },
  };
})();
