// The songs picked for a song sheet or slides, shared by sheet.html and slides.html: loading the
// songs, the list with ✎ ↑ ↓ ✕, and edits made with ✎. Edits only change a song on the sheet and
// slides in this browser (and in their share links), never in the song files.
(function () {
  const BURMESE_DIGITS = '၀၁၂၃၄၅၆၇၈၉';
  const LABEL_LINE = /^\s*\[([^\]]*)\]\s*$/;
  const EDITS_KEY = 'lyrics-sheet-edits';

  const $ = (sel) => document.querySelector(sel);
  const ui = {
    list: $('#sheet-songs'),
    count: $('#song-count'),
    empty: $('#no-songs'),
    editor: $('#line-editor'),
    editTitle: $('#edit-title'),
    editText: $('#edit-text'),
  };

  let songsBySlug = {};
  let picked = [];
  let edits = {}; // slug -> { text, base } where base is the song's lyrics when it was edited
  let editing = null; // slug open in the editor
  let encodedEdits = ''; // edits packed into the share link
  let page = { update() {}, scheduleUpdate() {}, saveSettings() {} }; // the page's own functions, from start()
  let viewOnly = false; // opened from a shared view link: leave this browser's own songs and edits alone

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const burmeseNumber = (n) => String(n).replace(/\d/g, (d) => BURMESE_DIGITS[d]);
  const pickedSongs = () => picked.map((slug) => songsBySlug[slug]).filter(Boolean);

  // The text used for a song: the edited version if there is one.
  function textOf(song) {
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

  // A song's verses, each a list of lines. With labels on, a label is joined to the line after it
  // ("[Chorus]" + "..." -> "CHO: ..."); with labels off, labels are left out.
  function verses(song, showLabels) {
    return textOf(song)
      .split(/\n\s*\n/)
      .map((stanza) => {
        const lines = stanza.split('\n').filter((l) => l.trim());
        const out = [];
        for (let i = 0; i < lines.length; i++) {
          const label = lines[i].match(LABEL_LINE);
          if (!label) {
            out.push(lines[i].trim());
          } else if (showLabels) {
            const next = lines[i + 1] !== undefined && !LABEL_LINE.test(lines[i + 1]) ? lines[++i] : '';
            out.push(`${shortLabel(label[1].trim())} ${next.trim()}`.trim());
          }
        }
        return out;
      })
      .filter((lines) => lines.length);
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

  let editsTimer;
  function editsChanged() {
    // Only keep edits for picked songs that still match the song they were made from.
    for (const slug of Object.keys(edits)) {
      const song = songsBySlug[slug];
      if (!picked.includes(slug) || !song || edits[slug].base !== song.lyrics || edits[slug].text === song.lyrics) delete edits[slug];
    }
    if (!viewOnly) storageSet(EDITS_KEY, edits);
    clearTimeout(editsTimer);
    editsTimer = setTimeout(async () => {
      encodedEdits = await packEdits(edits);
      page.saveSettings();
    }, 400);
  }

  // Packs the latest edits into the share link right away (for "Copy link").
  async function flushEdits() {
    clearTimeout(editsTimer);
    encodedEdits = await packEdits(edits);
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
            <button type="button" data-edit="${i}" aria-label="Edit ${escapeHtml(song.title)} for the sheet and slides" title="Edit for the sheet and slides">✎</button>
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
    page.update();
  });

  // ---- Editor: change the words or lines of a song for the sheet and slides only ----

  ui.editText.addEventListener('input', () => {
    const song = songsBySlug[editing];
    if (!song) return;
    edits[song.slug] = { text: ui.editText.value, base: song.lyrics };
    editsChanged();
    page.scheduleUpdate();
  });

  function openEditor(slug) {
    const song = songsBySlug[slug];
    if (!song) return;
    editing = slug;
    ui.editTitle.textContent = song.title;
    ui.editText.value = textOf(song);
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
    if (!song || !confirm('Undo all your changes to this song?')) return;
    delete edits[song.slug];
    ui.editText.value = song.lyrics;
    editsChanged();
    page.update();
  });

  // If songs change in another tab (e.g. + on the song list), follow along.
  SongSelection.onChange((songs) => {
    if (viewOnly || songs.join('\n') === picked.join('\n')) return;
    picked = songs;
    if (editing && !picked.includes(editing)) closeEditor();
    editsChanged();
    page.update();
  });

  // Loads the songs. A shared link brings its own songs and edits; otherwise use this browser's.
  // A view link (link.viewOnly) shows its songs without saving them over this browser's.
  // pageFunctions are the page's update(), scheduleUpdate() and saveSettings().
  async function start(link, pageFunctions) {
    page = pageFunctions;
    viewOnly = Boolean(link.viewOnly);
    const data = await fetch('songs.json', { cache: 'no-cache' }).then((r) => r.json());
    songsBySlug = Object.fromEntries(data.map((s) => [s.slug, s]));
    if (link.songs.length) {
      picked = link.songs.filter((slug) => songsBySlug[slug]);
      if (!viewOnly) SongSelection.set(picked);
      edits = (await unpackEdits(link.edits)) || {};
    } else {
      picked = SongSelection.all().filter((slug) => songsBySlug[slug]);
      edits = storageGet(EDITS_KEY, {});
    }
    editsChanged();
    // Wait for fonts so measurements match what gets printed or shown.
    if (document.fonts) await document.fonts.ready;
  }

  window.SetList = {
    escapeHtml,
    burmeseNumber,
    storageGet,
    storageSet,
    verses,
    songs: pickedSongs,
    slugs: () => [...picked],
    encodedEdits: () => encodedEdits,
    render: renderSongList,
    flushEdits,
    start,
  };
})();
