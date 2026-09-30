# Lyrics Library

A free, searchable lyrics site. Each song is a text file in `songs/`, and GitHub Pages hosts the site.

## Put it online (one-time setup)

1. Create a new **public** repository on [github.com/new](https://github.com/new), for example `lyrics`.
2. Push this folder to it:
   ```bash
   git init
   git add .
   git commit -m "First version"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/lyrics.git
   git push -u origin main
   ```
3. On GitHub, open the repo's **Settings → Pages**, and under **Source** choose **GitHub Actions**.
4. After about a minute, the site is live at `https://YOUR-USERNAME.github.io/lyrics/`.
   The **Actions** tab shows the deploy progress.

## Edit songs in the admin panel

Open https://chelxten.github.io/lyrics/admin.html to add, edit and delete songs.

- The password only keeps casual visitors out. Anyone can read it in the page's code.
- Saving needs a GitHub fine-grained token with **Contents: Read and write** access to this
  repository only. You paste it once on each device, and it's stored only in that browser.
- Each save is a commit to this repository, so GitHub keeps every earlier version.
  The website updates about a minute after you save.

## Song sheets

Anyone can tap **+** next to songs (on the song list, a song page or the admin list) and then
**Make song sheet**. `sheet.html` lays the songs out in columns on the chosen page size and
number of pages, with the largest text that fits, ready to print or save as PDF. Labels print
in short form: `[Verse 1]` → `V1`, `[Chorus]` → `CHO:`, `[Pre-Chorus]` → `Pre:`.
On the sheet page you can also:

- turn the labels off,
- set the text size yourself (the sheet then uses as many pages as it needs),
- change the line breaks of a song with **✎**: only Enter, Backspace/Delete and deleting whole
  lines are allowed, so the words stay as they are. These edits only apply to that sheet.

**Copy link** shares the exact sheet, including line edits.

## Song files

Each song is a file in `songs/`. The file name is used in the song's web address.
See `songs/_template.md` for the format:

- `title:` is optional. Without it, the site shows the file name.
- `font: win` means the song was typed with a Win Innwa-style Burmese font. The site converts
  it to Unicode Burmese (see `scripts/win-to-unicode.mjs`). Put English words in `backticks`
  so they aren't converted.
- A line like `[Chorus]` shows up as a section label.

## Preview on your computer

```bash
node scripts/build-index.mjs && python3 -m http.server 8000
```

Then open http://localhost:8000.

## About copyright

Most song lyrics are copyrighted. Only publish lyrics you wrote, have permission for,
or that are in the public domain.
