# rachybphotography

Photo sales site for Hamilton College sports and campus events. Plain static site (HTML/CSS/JS, no build step), deployed on Render from GitHub.

## How it's organized

| Path | What it is |
| --- | --- |
| `index.html`, `assets/` | The site itself |
| `data/site.json` | Your name, contact, payment info, prices, and the list of galleries |
| `photos/<gallery-id>/` | Watermarked web copies (`thumbs/` holds the small grid versions) |
| `originals/` | Your unwatermarked originals. **Git-ignored, so they never go public.** |
| `tools/add_event.py` | Adds a gallery: downloads, watermarks, and registers photos |

## Adding a gallery

1. In Google Drive, share the folder as **Anyone with the link can view**.
2. Run (or ask Claude to run):

```bash
python tools/add_event.py --title "Hamilton Soccer" --date 2026-10-14 --category Soccer --drive "<folder link>"
```

Every photo gets the diagonal `rachybphotography` watermark automatically. The gallery link becomes `yoursite/#hamilton-soccer-1014`, and photos are numbered `SOC1014-01`, `-02`, and so on, which buyers quote when they order.

To add more photos to an existing gallery:

```bash
python tools/add_event.py --id hamilton-soccer-1014 --append --drive "<folder link>"
```

Adding the first real gallery automatically removes the placeholder "Sample" gallery.

Then commit and push. Render redeploys on its own.

## Settings

In `data/site.json` → `config`:

- `pricePerPhoto`: currently `5`
- `venmo`: your Venmo username (no @)
- `orderEndpoint`: optional Formspree form URL, like `https://formspree.io/f/abcdwxyz`

## How orders work

1. As the buyer adds photos, the order panel builds a Venmo note, for example:
   `rachybphotography order: SOC1014-02,05,07 | 3 photos $30 | email: [YOUR EMAIL HERE]`
2. They copy it, pay you on Venmo (the button opens Venmo with the amount and note filled in), and replace `[YOUR EMAIL HERE]` with their email.
3. Venmo's payment notification shows you the note: which photos, and where to send them.
4. Email the buyer the clean files from `originals/`. Each photo's original filename is listed under `source` in `data/site.json`.

Optional: set `orderEndpoint` to a Formspree form link and you also get an email (with the original filenames) when someone taps the Venmo button.

## Claude artifacts (one per game)

- Home page: https://claude.ai/artifact/WSeTzD3eEe32DgH4FYhRMd — a card for each game.
- Each game is its own artifact, e.g. Hamilton vs Amherst Soccer 10/10: https://claude.ai/artifact/7mZz6khHvkgTDcjx7d3XN5

New game, after `add_event.py`:
1. `python tools/build_artifact.py game <gallery-id>` builds `artifact/game-<id>.html` and its photo strips.
2. Publish that page (root `artifact/`, with the strip files, in batches under 64 MB) as a **new** artifact.
3. Put the new link in `data/site.json` as that event's `"url"`.
4. `python tools/build_artifact.py hub`, then republish `artifact/index.html` plus its new cover to the home page link.

Each game artifact holds up to 511 files / 256 MB, which is several thousand photos.

## Preview locally

```bash
python -m http.server 8080
```

## Deploying on Render

Push this repo to GitHub, then in Render go to **New → Blueprint** (it reads `render.yaml`) or **New → Static Site**, pick the repo, leave the build command empty, and set the publish directory to `.`.
