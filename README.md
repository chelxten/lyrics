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

## Add a song

1. Copy `songs/_template.md` to a new file, like `songs/my-song.md`.
   The file name becomes the song's web address, so use lowercase words and dashes.
2. Fill in the title, artist and lyrics.
3. Commit and push, or use **Add file → Create new file** on GitHub's website.
   The site updates itself within a minute or two.

Others can suggest songs by opening a pull request, which you approve before anything goes live.

## Preview on your computer

```bash
node scripts/build-index.mjs && python3 -m http.server 8000
```

Then open http://localhost:8000.

## About copyright

Most song lyrics are copyrighted. Only publish lyrics you wrote, have permission for,
or that are in the public domain, like the three examples included here.
