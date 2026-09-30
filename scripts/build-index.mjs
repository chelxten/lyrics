// Reads every songs/*.md file and writes songs.json for the website.
// Usage: node scripts/build-index.mjs

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const songsDir = path.join(root, 'songs');

// Files starting with "_" (like _template.md) are ignored.
const files = (await readdir(songsDir)).filter((f) => f.endsWith('.md') && !f.startsWith('_'));

const songs = [];
for (const file of files) {
  const { meta, body } = parse(await readFile(path.join(songsDir, file), 'utf8'));
  if (!meta.title) {
    console.warn(`Skipping ${file}: missing "title:" at the top`);
    continue;
  }
  songs.push({
    slug: file.replace(/\.md$/, ''),
    title: meta.title,
    artist: meta.artist || '',
    album: meta.album || '',
    year: meta.year || '',
    tags: meta.tags ? meta.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    lyrics: body.trim(),
  });
}

songs.sort((a, b) => a.title.localeCompare(b.title));
await writeFile(path.join(root, 'songs.json'), JSON.stringify(songs, null, 2) + '\n');
console.log(`Wrote ${songs.length} songs to songs.json`);

// Minimal front matter parser: "key: value" lines between two "---" lines.
function parse(raw) {
  const text = raw.replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    meta[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return { meta, body: m[2] };
}
