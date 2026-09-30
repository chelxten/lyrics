// Song search, shared by the song library (app.js) and the "Add songs" box on the song sheet and
// slides pages (setlist.js).
(function () {
  // Lowercase, strip accents and apostrophes, turn other punctuation into spaces.
  function normalize(s) {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/['’]/g, '')
      .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Wrap each search word in <mark>, escaping everything else.
  function highlight(text, words) {
    if (!words.length) return escapeHtml(text);
    const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return text
      .split(pattern)
      .map((part, i) => (i % 2 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)))
      .join('');
  }

  function prepare(song) {
    const lines = song.lyrics.split('\n').filter((l) => l.trim() && !/^\[.*\]$/.test(l.trim()));
    return {
      ...song,
      _title: normalize(song.title),
      _artist: normalize(song.artist),
      _tags: normalize(song.tags.join(' ')),
      _aliases: normalize((song.aliases || []).join(' ')),
      _lyrics: normalize(song.lyrics),
      _lines: lines.map((l) => ({ text: l, norm: normalize(l) })),
    };
  }

  // Every word must appear somewhere; title/artist matches rank above lyric matches.
  function search(songs, query) {
    const phrase = normalize(query);
    const words = phrase.split(' ').filter(Boolean);
    if (!words.length) return { words, hits: songs.map((song) => ({ song })) };

    const hits = [];
    for (const song of songs) {
      let score = 0;
      let ok = true;
      for (const w of words) {
        if (song._title.includes(w) || song._aliases.includes(w)) score += 10;
        else if (song._artist.includes(w)) score += 5;
        else if (song._tags.includes(w)) score += 3;
        else if (song._lyrics.includes(w)) score += 1;
        else { ok = false; break; }
      }
      if (!ok) continue;
      if (song._title.includes(phrase) || song._aliases.includes(phrase)) score += 20;
      if (words.length > 1 && song._lyrics.includes(phrase)) score += 15;

      // Pick the lyric line that best matches, to show as a preview.
      let snippet = null;
      let best = 0;
      for (const line of song._lines) {
        let n = words.filter((w) => line.norm.includes(w)).length;
        if (words.length > 1 && line.norm.includes(phrase)) n += words.length;
        if (n > best) { best = n; snippet = line.text; }
      }
      hits.push({ song, score, snippet });
    }
    hits.sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title));
    return { words, hits };
  }

  // Finds a song's current file name from any name it has had (its aliases), so old links, saved
  // song lists and edits still work after a song is renamed.
  function slugResolver(songs) {
    const names = new Map();
    for (const song of songs) for (const alias of song.aliases || []) names.set(alias, song.slug);
    for (const song of songs) names.set(song.slug, song.slug);
    return (name) => names.get(name);
  }

  window.SongSearch = { normalize, prepare, search, highlight, slugResolver };
})();
