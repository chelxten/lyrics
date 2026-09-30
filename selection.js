// Songs picked for a song sheet. Shared by the song list, the admin panel and sheet.html,
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
    button.title = on ? 'Remove from song sheet' : 'Add to song sheet';
    button.textContent = button.classList.contains('wide') ? (on ? '✓ In song sheet' : '+ Add to song sheet') : on ? '✓' : '+';
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
      button.setAttribute('aria-label', `Song sheet: ${title}`);
      return button.outerHTML;
    },

    // Bar at the bottom of the page showing how many songs are picked.
    mountTray() {
      const tray = document.createElement('div');
      tray.className = 'sheet-tray';
      tray.innerHTML = `
        <span class="count"></span>
        <button type="button" class="link-button">Clear</button>
        <a class="tray-button" href="sheet.html">Make song sheet →</a>`;
      tray.querySelector('button').addEventListener('click', () => {
        if (confirm('Remove all songs from the song sheet?')) save([]);
      });
      document.body.appendChild(tray);
      const update = () => {
        tray.hidden = !songs.length;
        document.body.classList.toggle('has-tray', songs.length > 0);
        tray.querySelector('.count').innerHTML = `<b>${songs.length}</b> ${songs.length === 1 ? 'song' : 'songs'} picked`;
      };
      listeners.add(update);
      update();
    },
  };
})();
