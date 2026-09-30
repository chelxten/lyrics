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
number of pages, with the largest text that fits, ready to print or save as PDF. **Download JPG** saves each page as an image. Labels print
in short form: `[Verse 1]` → `V1`, `[Chorus]` → `CHO:`, `[Pre-Chorus]` → `Pre:`.
On the sheet page you can also:

- turn the labels off,
- set the text size yourself (the sheet then uses as many pages as it needs),
- edit a song's words and line breaks with **✎**. These edits only apply to that sheet: they're
  kept in the browser and in the sheet's link, and the song file in the repository never changes.

**Copy link** gives a link that opens just the sheet, with your edits and the **Print / Save as PDF**
and **Download JPG** buttons but none of the controls. Opening it doesn't change the songs the other person has picked.

## Slides

After picking songs with **+**, tap **Slides** (or **Make slides with these songs** on the song
sheet page). `slides.html` makes a PowerPoint file: an optional title slide, then for each song a
title slide and one slide per verse. There are two formats:

- **Full screen**: one verse per slide, white text on black or black on white.
- **Subtitles**: one or two lines per slide at the bottom of the screen, on a transparent, black or
  green (chroma key) background, as white text on a dark band or outlined. Each song starts with its
  title as a caption. Transparent PNGs can go straight over video in OBS, vMix or a video editor.

You can choose widescreen (16:9) or standard (4:3), labels on or off, and the text size (**Fit automatically** picks the
largest size that keeps every verse on one slide). **Download PowerPoint** saves a `.pptx` file that
opens in PowerPoint, Keynote and Google Slides (PowerPoint slides can't be transparent, so a
transparent background becomes black there). **Download PNGs** saves a zip with one image per slide
(1920 × 1080 for widescreen).

**Copy link** works the same way here: the link opens just the slides, with a **Download PowerPoint**
button.

The song list and **✎** edits are shared with the song sheet: an edit made on one page shows on the
other, and never changes the song files.

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
