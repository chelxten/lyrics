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

## Pages

The home page welcomes visitors with four buttons: **Song library** (search and read every song, at
`#/songs`), **Song sheet**, **PowerPoint** and **Subtitles**. The last three use the songs picked
with **+** in the library; the bar at the bottom of the library links to all three. On the song
sheet and slides pages you can also add songs with the **Add songs** search box: tap a result to
add or remove it, or press Enter to add the best match.

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
- choose what happens when a song doesn't fit in the rest of a column: continue it in the next
  column, or move the whole song to the next column (a song longer than a column still continues),
- set the text size yourself (the sheet then uses as many pages as it needs),
- edit a song's words and line breaks with **✎**. These edits only apply to that sheet: they're
  kept in the browser and in the sheet's link, and the song file in the repository never changes.

**Copy link** gives a link that opens just the sheet, with your edits and the **Print / Save as PDF**
and **Download JPG** buttons but none of the controls. Opening it doesn't change the songs the other person has picked.

## Slides

After picking songs with **+**, tap **Slides** (or **Make slides with these songs** on the song
sheet page). `slides.html` makes a PowerPoint file: an optional title slide, then for each song a
title slide and one slide per verse. There are two formats:

- **Full screen**: one verse per slide, with a color picker for the background and the text.
- **Subtitles**: one or two lines per slide at the bottom of the screen, as text on a band (with a
  band color and an opacity slider) or as outlined text (with an outline color). The text and the
  background have color pickers too, and the background can be transparent. Each song starts with its
  title as a caption. Transparent PNGs can go straight over video in OBS, vMix or a video editor.

You can choose widescreen (16:9) or standard (4:3), labels on or off, and the text size (**Fit automatically** picks the
largest size that keeps every verse on one slide). **Download PowerPoint** saves a `.pptx` file that
opens in PowerPoint, Keynote and Google Slides (PowerPoint slides can't be transparent, so a
transparent background becomes black there). **Download PNGs** saves a zip with one image per slide
(1920 × 1080 for widescreen).

**Copy link** works the same way here: the link opens just the slides, with a **Download PowerPoint**
button.

### Presenting from the browser

Instead of downloading, you can present the slides straight from the slides page (also from a
shared link):

- **▶ Present** shows them full screen in the same window. Use the arrow keys, Space, Page Up/Down
  or a clicker, or tap the right or left of the screen (or swipe) on a phone or tablet. **B** blanks
  the screen, **Esc** ends.
- **Presenter view** (on a laptop) opens an audience window: drag it to the projector or TV and
  click **Show full screen**. The laptop then shows the current slide, the next one, the words of
  every slide (click one to jump to it), a timer and big Previous / Blank / Next buttons. Both
  windows must be in the same browser on the same computer.

The song list and **✎** edits are shared with the song sheet: an edit made on one page shows on the
other, and never changes the song files.

## Bible

The **Bible** page has the Judson Burmese Bible (1840) and the King James Version, both public domain
(see `bible/README.md`). Type a reference in English or Burmese (`John 3:16-18`, `Ps 23`,
`ယောဟန် ၃:၁၆`), or pick a book and chapter, tap verses to choose some of them, and **+ Add** the
passage to your set. Press Enter to search the whole Bible for words instead.

A passage can also be added by typing its reference in the **Add a song** box on the song sheet and
slides pages. Passages sit in the same list as songs and show up on the song sheet, the PowerPoint,
the subtitles, the PNGs and when presenting. **Bible verses in** chooses Burmese, English or both,
and on slides **Verses per slide** chooses one or two; PowerPoint slides show the reference in the
corner.

## Song files

Each song is a file in `songs/`. The file name is used in the song's web address.
See `songs/_template.md` for the format:

- Each song's file is named after its title (the admin panel does this, and renames the file when
  the title changes), so its web address matches the title.
- `aliases:` lists the song's old file names, separated by commas. Links, saved song lists and
  searches that use an old name (for example in English letters) still find the song. The admin
  panel adds the old name when it renames a song.
- The songs are stored as Unicode Burmese.
- You can still type songs with a Win Innwa-style Burmese font: in the admin panel, tick "Typed
  with the Win font" (it's ticked for new songs). When you save, the title and lyrics are converted
  (see `scripts/win-to-unicode.mjs`) and stored as Unicode; the Win text isn't kept. Put English
  words in `backticks` so they aren't converted.
- A song file with `font: win` (for example, one added directly on GitHub) is still converted when
  the site builds, and becomes Unicode the next time it's saved in the admin panel.
- A line like `[Chorus]` shows up as a section label.

## Preview on your computer

```bash
node scripts/build-index.mjs && python3 -m http.server 8000
```

Then open http://localhost:8000.

## About copyright

Most song lyrics are copyrighted. Only publish lyrics you wrote, have permission for,
or that are in the public domain.
