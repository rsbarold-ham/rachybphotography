"""Add (or extend) a gallery on rachybphotography.

Pulls photos from a shared Google Drive folder (or a local folder), stamps the
diagonal "rachybphotography" watermark on every one, saves web-size copies to
photos/<event-id>/ (plus thumbs/), and records the event in data/site.json.

Unwatermarked originals are kept in originals/, which is git-ignored, so they
never reach the public site.

Examples
  python tools/add_event.py --title "Hamilton Soccer" --date 2026-10-14 \
      --category Soccer --drive "https://drive.google.com/drive/folders/XXXX"

  # add more photos to an event that already exists
  python tools/add_event.py --id hamilton-soccer-1014 --append --folder "D:/more shots"

The Drive folder must be shared as "Anyone with the link can view".
"""
import argparse
import html
import json
import math
import re
import shutil
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SITE_JSON = ROOT / "data" / "site.json"
PHOTOS = ROOT / "photos"
ORIGINALS = ROOT / "originals"

WATERMARK = "rachybphotography"
FULL_EDGE = 2000   # long edge of the lightbox image
THUMB_EDGE = 800   # long edge of grid thumbnails
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}
FONT_CANDIDATES = [
    "C:/Windows/Fonts/arialbd.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
UA = {"User-Agent": "Mozilla/5.0"}


def load_font(size):
    for f in FONT_CANDIDATES:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default(size)


def watermark(img):
    """Stamp WATERMARK corner to corner along the image diagonal."""
    w, h = img.size
    diag = math.hypot(w, h)
    angle = math.degrees(math.atan2(h, w))
    # size the text to span ~80% of the diagonal
    probe = load_font(100)
    tw = probe.getlength(WATERMARK)
    font = load_font(max(12, int(100 * diag * 0.8 / tw)))
    l, t, r, b = font.getbbox(WATERMARK)
    pad = int((b - t) * 0.4)
    layer = Image.new("RGBA", (r - l + 2 * pad, b - t + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    stroke = max(1, (b - t) // 30)
    d.text((pad - l, pad - t), WATERMARK, font=font, fill=(255, 255, 255, 105),
           stroke_width=stroke, stroke_fill=(0, 0, 0, 55))
    layer = layer.rotate(angle, expand=True, resample=Image.BICUBIC)
    base = img.convert("RGBA")
    base.alpha_composite(layer, ((w - layer.width) // 2, (h - layer.height) // 2))
    return base.convert("RGB")


def fit(img, edge):
    img = img.copy()
    img.thumbnail((edge, edge), Image.LANCZOS)
    return img


# ---------- Google Drive ----------

def folder_id(url):
    m = re.search(r"/folders/([\w-]+)", url) or re.search(r"[?&]id=([\w-]+)", url)
    if not m:
        sys.exit(f"Could not find a folder id in: {url}")
    return m.group(1)


def drive_list(fid):
    page = urllib.request.urlopen(urllib.request.Request(
        f"https://drive.google.com/embeddedfolderview?id={fid}", headers=UA)).read().decode("utf-8", "replace")
    items = re.findall(r'id="entry-([\w-]+)".*?class="flip-entry-title">(.*?)</div>', page, re.S)
    if not items:
        sys.exit("No files found. Make sure the folder is shared as 'Anyone with the link can view'.")
    return [(i, html.unescape(n)) for i, n in items]


def drive_download(fid, dest):
    url = f"https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t"
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)


def fetch_drive(url, dest):
    dest.mkdir(parents=True, exist_ok=True)
    files = []
    for fid, name in drive_list(folder_id(url)):
        if Path(name).suffix.lower() not in IMAGE_EXT:
            print(f"  skip (not a supported image): {name}")
            continue
        out = dest / name
        if not out.exists():
            print(f"  downloading {name}")
            drive_download(fid, out)
        files.append(out)
    return files


# ---------- main ----------

def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--drive", help="shared Google Drive folder link")
    src.add_argument("--folder", help="local folder of photos")
    ap.add_argument("--title", help='e.g. "Hamilton Soccer"')
    ap.add_argument("--date", help="YYYY-MM-DD")
    ap.add_argument("--category", help="e.g. Soccer, Football, Campus")
    ap.add_argument("--code", help="order-number prefix, e.g. SOC1014 (default: from category + date)")
    ap.add_argument("--blurb", default="", help="one line shown under the gallery title")
    ap.add_argument("--id", help="gallery id used in the link (default: title + date)")
    ap.add_argument("--append", action="store_true", help="add photos to an existing gallery")
    ap.add_argument("--sample", action="store_true", help="mark as placeholder gallery")
    a = ap.parse_args()

    site = json.loads(SITE_JSON.read_text(encoding="utf-8"))
    events = site["events"]

    if a.append:
        if not a.id:
            sys.exit("--append needs --id of the existing gallery")
        ev = next((e for e in events if e["id"] == a.id), None)
        if not ev:
            sys.exit(f"No gallery with id {a.id}")
    else:
        if not (a.title and a.date and a.category):
            sys.exit("New galleries need --title, --date and --category")
        _, m, d = a.date.split("-")
        eid = a.id or f"{slugify(a.title)}-{m}{d}"
        if any(e["id"] == eid for e in events):
            sys.exit(f"Gallery {eid} already exists. Use --append --id {eid} to add photos to it.")
        ev = {"id": eid, "title": a.title, "date": a.date, "category": a.category,
              "code": a.code or (re.sub(r"[^A-Z]", "", a.category.upper())[:3] + m + d),
              "blurb": a.blurb, "photos": []}
        if a.sample:
            ev["sample"] = True
        else:
            # first real gallery replaces any placeholder galleries
            for s in [e for e in events if e.get("sample")]:
                events.remove(s)
                shutil.rmtree(PHOTOS / s["id"], ignore_errors=True)
                print(f"Removed placeholder gallery {s['id']}")
        events.append(ev)

    orig_dir = ORIGINALS / ev["id"]
    if a.drive:
        print("Reading Google Drive folder…")
        files = fetch_drive(a.drive, orig_dir)
    else:
        files = [p for p in Path(a.folder).iterdir() if p.suffix.lower() in IMAGE_EXT]
    files.sort(key=lambda p: p.name.lower())
    if not files:
        sys.exit("No photos found.")

    out_dir = PHOTOS / ev["id"]
    (out_dir / "thumbs").mkdir(parents=True, exist_ok=True)
    n = len(ev["photos"])
    for p in files:
        try:
            img = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
        except Exception as e:
            print(f"  skip {p.name}: {e}")
            continue
        n += 1
        name = f"{n:03d}.jpg"
        big = watermark(fit(img, FULL_EDGE))
        big.save(out_dir / name, quality=82, optimize=True, progressive=True)
        watermark(fit(img, THUMB_EDGE)).save(out_dir / "thumbs" / name, quality=78, optimize=True, progressive=True)
        ev["photos"].append({"file": name, "w": big.width, "h": big.height, "source": p.name})
        print(f"  {ev['code']}-{n:03d}  <- {p.name}", flush=True)

    SITE_JSON.write_text(json.dumps(site, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nDone: {ev['title']} ({ev['id']}) now has {len(ev['photos'])} photos.")


if __name__ == "__main__":
    main()
