// Admin panel: edit, add and delete songs by committing to the GitHub repo through its API.
// The site has no server, so the password below only keeps casual visitors out. What actually
// protects the songs is the GitHub token, which is stored only in the admin's own browser.

import { winToUnicode } from './scripts/win-to-unicode.mjs';

const REPO = 'chelxten/lyrics';
const BRANCH = 'main';
const PASSWORD_HASH = '25f43b1486ad95a1398e3eeb3d83bc4010015fcc9bedb35b432e00298d5021f7'; // SHA-256 of the password
const TOKEN_KEY = 'lyrics-admin-token';
const UNLOCKED_KEY = 'lyrics-admin-unlocked';

const app = document.querySelector('#admin');
const logoutButton = document.querySelector('#logout');

let flash = ''; // one-off message shown on the next screen
let titles = null; // slug -> converted title, from the published songs.json
let oldNames = {}; // slug -> old file names (aliases), from the published songs.json
let dirty = false; // unsaved edits in the editor

// Browser storage can be unavailable (private mode, blocked site data), so never let it throw.
const storage = {
  get: (area, key) => { try { return window[area].getItem(key); } catch { return null; } },
  set: (area, key, value) => { try { window[area].setItem(key, value); } catch {} },
  remove: (area, key) => { try { window[area].removeItem(key); } catch {} },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sha256(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- GitHub API ----

async function github(path, options = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${storage.get('localStorage', TOKEN_KEY)}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    let message = res.statusText;
    try { message = (await res.json()).message || message; } catch {}
    throw Object.assign(new Error(message), { status: res.status });
  }
  return res.status === 204 ? null : res.json();
}

const songPath = (name) => `/contents/songs/${encodeURIComponent(name)}.md`;

// Saves a song under a new file name in one commit: the new file is added and the old one removed.
// Returns the new file's sha. Fails like a save would if the song changed since it was opened, or
// if another song already has the new name.
async function saveRenamed(oldName, newName, content, openedSha) {
  const head = (await github(`/git/ref/heads/${BRANCH}`)).object.sha;
  const current = await github(`${songPath(oldName)}?ref=${head}`);
  if (current.sha !== openedSha) throw Object.assign(new Error('Changed elsewhere'), { status: 409 });
  const taken = await github(`${songPath(newName)}?ref=${head}`).then(() => true, (err) => (err.status === 404 ? false : Promise.reject(err)));
  if (taken) throw Object.assign(new Error('Name taken'), { exists: true });
  const tree = await github('/git/trees', {
    method: 'POST',
    body: JSON.stringify({
      base_tree: (await github(`/git/commits/${head}`)).tree.sha,
      tree: [
        { path: `songs/${newName}.md`, mode: '100644', type: 'blob', content },
        { path: `songs/${oldName}.md`, mode: '100644', type: 'blob', sha: null },
      ],
    }),
  });
  const commit = await github('/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message: `Rename ${oldName} to ${newName} (admin panel)`, tree: tree.sha, parents: [head] }),
  });
  try {
    await github(`/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
  } catch (err) {
    // Something else was saved in the meantime.
    throw err.status === 422 ? Object.assign(new Error('Changed elsewhere'), { status: 409 }) : err;
  }
  return (await github(`${songPath(newName)}?ref=${commit.sha}`)).sha;
}

function decodeBase64(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// Turns an API error into a message the admin can act on.
function explain(err) {
  if (err.status === 401) {
    storage.remove('localStorage', TOKEN_KEY);
    return 'GitHub no longer accepts your token (it may have expired). Please connect again.';
  }
  if (err.status === 403 || err.status === 404) {
    return 'Your token can’t change this repository. Make sure it has access to the lyrics repository with Contents set to “Read and write”.';
  }
  if (err.status === 409) return 'This song was changed somewhere else. Reload the page to get the latest version, then redo your edit.';
  if (err instanceof TypeError) return 'Couldn’t reach GitHub. Check your internet connection and try again.';
  return err.message;
}

// ---- Song files ("key: value" front matter between --- lines, then the lyrics) ----

function parse(raw) {
  const text = raw.replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  if (!m) return { meta, body: text };
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i !== -1) meta[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}

// A song's file name is its title, without characters that file names and web addresses can't have.
const fileNameFor = (title) => title.replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[._]+/, '');
const splitList = (value) => (value || '').split(',').map((s) => s.trim()).filter(Boolean);

function serialize(meta, body) {
  const lines = Object.entries(meta).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  return (lines.length ? `---\n${lines.join('\n')}\n---\n` : '') + body.trim() + '\n';
}

function renderLyrics(text) {
  return text
    .split('\n')
    .map((line) => (/^\[.*\]$/.test(line.trim())
      ? `<span class="section">${escapeHtml(line.trim().slice(1, -1))}</span>`
      : escapeHtml(line)))
    .join('\n');
}

const LABEL_LINE = /^\s*\[[^\]]*\]\s*$/;

// Puts "[label]" on its own line at the start of the line the cursor is on, with a blank line
// before it. If that line is already a label, it is replaced. "Verse" gets the next number.
function insertLabel(textarea, label) {
  const value = textarea.value;
  const cursor = textarea.selectionStart;
  const lineStart = cursor === 0 ? 0 : value.lastIndexOf('\n', cursor - 1) + 1;
  let lineEnd = value.indexOf('\n', lineStart);
  if (lineEnd === -1) lineEnd = value.length;
  const line = value.slice(lineStart, lineEnd);

  const start = lineStart;
  let end = lineStart;
  if (LABEL_LINE.test(line) || !line.trim()) end = Math.min(lineEnd + 1, value.length); // replace a label or blank line

  const before = value.slice(0, start);
  if (label === 'Verse') {
    const versesBefore = before.split('\n').filter((l) => /^\s*\[verse\b/i.test(l)).length;
    label = `Verse ${versesBefore + 1}`;
  }

  const gap = !before.trim() || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const text = `${gap}[${label}]\n`;

  textarea.focus();
  textarea.setSelectionRange(start, end);
  // insertText keeps the browser's undo history; fall back if it isn't supported.
  if (!document.execCommand('insertText', false, text)) {
    textarea.setRangeText(text, start, end, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// ---- Screens ----

function route() {
  const unlocked = storage.get('sessionStorage', UNLOCKED_KEY) === '1';
  logoutButton.hidden = !unlocked;
  dirty = false;
  if (!unlocked) return renderLogin();
  if (!storage.get('localStorage', TOKEN_KEY)) return renderConnect();
  const edit = location.hash.match(/^#\/edit\/(.+)$/);
  if (edit) return renderEditor(decodeURIComponent(edit[1]));
  if (location.hash === '#/new') return renderEditor(null);
  return renderList();
}

function takeFlash() {
  const html = flash ? `<p class="flash">${escapeHtml(flash)}</p>` : '';
  flash = '';
  return html;
}

function renderLogin() {
  app.innerHTML = `
    <form class="panel narrow" id="login">
      <h1>Admin</h1>
      <label>Password <input type="password" id="password" autocomplete="current-password" autofocus></label>
      <p class="error" id="error" hidden>Wrong password.</p>
      <button class="primary">Unlock</button>
    </form>`;
  app.querySelector('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ((await sha256(app.querySelector('#password').value)) === PASSWORD_HASH) {
      storage.set('sessionStorage', UNLOCKED_KEY, '1');
      route();
    } else {
      app.querySelector('#error').hidden = false;
    }
  });
}

function renderConnect(message = '') {
  const repoName = REPO.split('/')[1];
  app.innerHTML = `
    <form class="panel narrow" id="connect">
      <h1>Connect to GitHub</h1>
      ${takeFlash()}
      <p>To save changes, this browser needs a GitHub token that can edit your <b>${repoName}</b> repository. You only do this once on each device.</p>
      <ol>
        <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → New fine-grained token</a>.</li>
        <li>Name it <i>Lyrics admin</i> and choose an expiration date.</li>
        <li>Under <b>Repository access</b>, choose <b>Only select repositories</b> and pick <b>${repoName}</b>.</li>
        <li>Under <b>Permissions</b>, add <b>Contents</b> and set it to <b>Read and write</b>.</li>
        <li>Click <b>Generate token</b>, copy it, and paste it here.</li>
      </ol>
      <label>Token <input type="password" id="token" autocomplete="off" spellcheck="false" required></label>
      <p class="error" id="error" ${message ? '' : 'hidden'}>${escapeHtml(message)}</p>
      <button class="primary" id="connect-button">Connect</button>
      <p class="muted">The token is saved only in this browser. Anyone who uses this browser can edit your songs, so only connect on your own devices.</p>
    </form>`;
  app.querySelector('#connect').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = app.querySelector('#connect-button');
    button.disabled = true;
    button.textContent = 'Checking…';
    storage.set('localStorage', TOKEN_KEY, app.querySelector('#token').value.trim());
    try {
      await github('');
      route();
    } catch (err) {
      storage.remove('localStorage', TOKEN_KEY);
      renderConnect(err.status === 401 ? 'GitHub didn’t accept that token. Copy it again and paste the whole thing.' : explain(err));
    }
  });
}

async function renderList() {
  app.innerHTML = `
    ${takeFlash()}
    <div class="toolbar">
      <input type="search" id="filter" placeholder="Filter songs…" aria-label="Filter songs" autocomplete="off">
      <a class="button primary" href="#/new">New song</a>
    </div>
    <p class="muted" id="status">Loading songs…</p>
    <ul class="results" id="list"></ul>
    <p class="muted"><button class="link-button" id="forget">Disconnect GitHub on this device</button></p>`;

  app.querySelector('#forget').addEventListener('click', () => {
    if (!confirm('Remove the GitHub token from this browser? You’ll need to paste a token again to edit.')) return;
    storage.remove('localStorage', TOKEN_KEY);
    route();
  });

  let songs;
  try {
    const [files, published] = await Promise.all([
      github(`/contents/songs?ref=${BRANCH}`),
      titles ? null : fetch('songs.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    if (published) {
      titles = Object.fromEntries(published.map((s) => [s.slug, s.title]));
      oldNames = Object.fromEntries(published.map((s) => [s.slug, s.aliases || []]));
    }
    songs = files
      .filter((f) => f.name.endsWith('.md') && !f.name.startsWith('_'))
      .map((f) => {
        const slug = f.name.slice(0, -3);
        return { slug, title: titles[slug] || slug, aliases: oldNames[slug] || [] };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  } catch (err) {
    const message = explain(err);
    if (err.status === 401) return renderConnect(message);
    app.querySelector('#status').textContent = message;
    return;
  }

  const filter = app.querySelector('#filter');
  const show = () => {
    const q = filter.value.trim().toLowerCase();
    const matches = songs.filter((s) => !q || [s.slug, s.title, ...s.aliases].some((name) => name.toLowerCase().includes(q)));
    app.querySelector('#status').textContent = `${matches.length} of ${songs.length} songs`;
    app.querySelector('#list').innerHTML = matches
      .map((s) => `<li><a href="#/edit/${encodeURIComponent(s.slug)}">
        <span class="title">${escapeHtml(s.title)}</span>
        ${s.title !== s.slug ? `<span class="artist"> · ${escapeHtml(s.slug)}</span>` : ''}
      </a>${SongSelection.pickButton(s.slug, s.title)}</li>`)
      .join('');
  };
  filter.addEventListener('input', show);
  show();
  filter.focus();
}

async function renderEditor(slug) {
  const isNew = slug === null;
  let sha = null;
  let meta = { font: 'win' };
  let body = '';

  if (!isNew) {
    app.innerHTML = `<p class="muted">Loading…</p>`;
    try {
      const file = await github(`${songPath(slug)}?ref=${BRANCH}`);
      sha = file.sha;
      ({ meta, body } = parse(decodeBase64(file.content)));
    } catch (err) {
      const message = explain(err);
      if (err.status === 401) return renderConnect(message);
      app.innerHTML = `<a class="back" href="#/">← All songs</a><p class="error">${escapeHtml(err.status === 404 ? 'This song doesn’t exist (it may have been deleted or renamed).' : message)}</p>`;
      return;
    }
  }

  app.innerHTML = `
    <a class="back" href="#/" id="back">← All songs</a>
    ${takeFlash()}
    <form class="editor" id="editor">
      <div>
        <h1 class="file-name">${isNew ? 'New song' : escapeHtml(slug)}</h1>
        <label>Title <input id="title" required spellcheck="false">
          <small class="muted">Also the song’s file name and web address. Changing it renames the file; old links still work.</small></label>
        <label class="check"><input type="checkbox" id="win"> Typed with the Win font (saved as Unicode Burmese)</label>
        <div class="field">
          <label for="lyrics">Lyrics</label>
          <div class="label-bar" role="toolbar" aria-label="Add a section label">
            <span class="muted">Add label:</span>
            <button type="button" data-label="Verse" title="Adds the next verse number">Verse</button>
            <button type="button" data-label="Pre-Chorus">Pre-Chorus</button>
            <button type="button" data-label="Chorus">Chorus</button>
            <button type="button" data-label="Bridge">Bridge</button>
            <button type="button" data-label="Ending">Ending</button>
            <button type="button" data-label="">Other…</button>
          </div>
          <textarea id="lyrics" spellcheck="false"></textarea>
        </div>
        <p class="muted hint">Click where a section starts, then click a label. Put English words in \`backticks\` so they aren’t converted.</p>
        <div class="actions">
          <button class="primary" id="save">${isNew ? 'Add song' : 'Save changes'}</button>
          ${isNew ? '' : '<button type="button" class="danger" id="delete">Delete song</button>'}
          <span class="muted" id="status" role="status"></span>
        </div>
      </div>
      <section class="preview" aria-label="Preview">
        <p class="muted">Preview</p>
        <h1 id="preview-title"></h1>
        <div class="lyrics" id="preview-lyrics"></div>
      </section>
    </form>`;

  const $ = (sel) => app.querySelector(sel);
  const titleInput = $('#title');
  const winInput = $('#win');
  const lyricsInput = $('#lyrics');
  const status = $('#status');

  titleInput.value = meta.title || '';
  winInput.checked = /^win/i.test(meta.font || '');
  lyricsInput.value = body.trim();

  const updatePreview = () => {
    const convert = winInput.checked ? winToUnicode : (s) => s;
    lyricsInput.classList.toggle('win-font', winInput.checked);
    $('#preview-title').textContent = convert(titleInput.value.trim()) || (isNew ? '' : slug);
    $('#preview-lyrics').innerHTML = renderLyrics(convert(lyricsInput.value.trim()));
  };
  $('#editor').addEventListener('input', () => { dirty = true; updatePreview(); });
  updatePreview();

  app.querySelectorAll('[data-label]').forEach((button) => {
    button.addEventListener('click', () => {
      let label = button.dataset.label;
      if (!label) label = (prompt('Label name (for example: Verse 4, Chorus 2, Intro)') || '').trim().replace(/[[\]]/g, '');
      if (label) insertLabel(lyricsInput, label);
    });
  });

  $('#back').addEventListener('click', (e) => {
    if (dirty && !confirm('You have unsaved changes. Leave without saving?')) e.preventDefault();
  });

  const setBusy = (busy, text) => {
    app.querySelectorAll('button').forEach((b) => { b.disabled = busy; });
    status.textContent = text;
  };

  $('#editor').addEventListener('submit', async (e) => {
    e.preventDefault();
    // Text typed with the Win font is converted and saved as Unicode; the Win text isn't kept.
    const win = winInput.checked;
    const convert = win ? winToUnicode : (s) => s;
    const title = convert(titleInput.value.trim());
    const lyrics = convert(lyricsInput.value);
    // The file is named after the title, so the song's web address matches it.
    const name = fileNameFor(title);
    if (!name) {
      status.textContent = 'Give the song a title. It’s also used as the song’s file name.';
      return;
    }
    const renamed = !isNew && name !== slug;
    // Old file names stay with the song, so old links, song lists and searches still find it.
    const aliases = [...new Set([...splitList(meta.aliases), ...(renamed ? [slug] : [])])];
    const { title: _, font: __, aliases: ___, ...rest } = meta;
    const newMeta = { title, aliases: aliases.join(', '), ...rest };
    const content = serialize(newMeta, lyrics);
    setBusy(true, 'Saving…');
    try {
      if (renamed) {
        sha = await saveRenamed(slug, name, content, sha);
      } else {
        const res = await github(songPath(name), {
          method: 'PUT',
          body: JSON.stringify({
            message: `${isNew ? 'Add' : 'Edit'} ${name} (admin panel)`,
            content: encodeBase64(content),
            branch: BRANCH,
            ...(sha ? { sha } : {}),
          }),
        });
        sha = res.content.sha;
      }
      meta = newMeta;
      dirty = false;
      if (titles) {
        if (renamed) delete titles[slug];
        titles[name] = title;
      }
      if (renamed) oldNames[name] = aliases;
      if (isNew || renamed) {
        flash = isNew
          ? 'Song added. It will appear on the website in about a minute.'
          : 'Saved, and the file is renamed to match the new title. Old links to the song still work. The website updates in about a minute.';
        location.hash = `#/edit/${encodeURIComponent(name)}`;
        return;
      }
      if (win) {
        // Carry on editing the saved Unicode text.
        titleInput.value = title;
        lyricsInput.value = lyrics.trim();
        winInput.checked = false;
        updatePreview();
      }
      setBusy(false, win ? 'Saved as Unicode Burmese. The website updates in about a minute.' : 'Saved. The website updates in about a minute.');
    } catch (err) {
      const exists = err.exists || (err.status === 422 && isNew);
      const message = exists ? 'A song with this title already exists. Add something to the title to tell them apart, like (၂).' : explain(err);
      if (err.status === 401) return renderConnect(message);
      setBusy(false, message);
    }
  });

  $('#delete')?.addEventListener('click', async () => {
    if (!confirm(`Delete “${slug}”? It will be removed from the website. (GitHub keeps a copy in its history.)`)) return;
    setBusy(true, 'Deleting…');
    try {
      await github(songPath(slug), {
        method: 'DELETE',
        body: JSON.stringify({ message: `Delete ${slug} (admin panel)`, sha, branch: BRANCH }),
      });
      if (titles) delete titles[slug];
      dirty = false;
      flash = `Deleted “${slug}”. It will disappear from the website in about a minute.`;
      location.hash = '#/';
    } catch (err) {
      const message = explain(err);
      if (err.status === 401) return renderConnect(message);
      setBusy(false, message);
    }
  });
}

logoutButton.addEventListener('click', () => {
  if (dirty && !confirm('You have unsaved changes. Log out anyway?')) return;
  storage.remove('sessionStorage', UNLOCKED_KEY);
  location.hash = '';
  route();
});

window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});
window.addEventListener('hashchange', route);
SongSelection.mountTray();
route();
