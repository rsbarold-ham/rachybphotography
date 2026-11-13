"""Build the Claude artifact pages into artifact/.

Each game is its own artifact; the home page ("hub") is one more artifact that links to them.

  python tools/build_artifact.py game <gallery-id>   # -> artifact/game-<id>.html + artifact/s/<id>/*.jpg
  python tools/build_artifact.py hub                 # -> artifact/index.html + artifact/covers/*.jpg

Game photos are packed into vertical strips so hundreds of photos fit the artifact's file limits.
A game's artifact link goes in data/site.json as the event's "url"; the hub lists only games that have one.
Prints the files to publish (relative to artifact/) as JSON on the last line.
"""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "artifact"
STRIPS = {"t": {"width": 360, "per": 30, "quality": 72},   # grid thumbnails
          "f": {"width": 1100, "per": 5, "quality": 78}}   # viewer size


def build_strips(ev, force):
    """Returns per-photo strip coords; rewrites strips only when the photo list changed."""
    src = ROOT / "photos" / ev["id"]
    dest = OUT / "s" / ev["id"]
    stamp = hashlib.sha1(json.dumps([p["file"] for p in ev["photos"]] + [STRIPS]).encode()).hexdigest()
    stamp_file = dest / "stamp.json"
    if not force and stamp_file.exists():
        saved = json.loads(stamp_file.read_text())
        if saved["stamp"] == stamp:
            return saved["coords"]
    dest.mkdir(parents=True, exist_ok=True)
    for old in dest.glob("*.jpg"):
        old.unlink()
    coords = [dict() for _ in ev["photos"]]
    for kind, cfg in STRIPS.items():
        W, per = cfg["width"], cfg["per"]
        for n, start in enumerate(range(0, len(ev["photos"]), per)):
            imgs = []
            for p in ev["photos"][start:start + per]:
                im = Image.open(src / p["file"]).convert("RGB")
                imgs.append(im.resize((W, round(W * im.height / im.width)), Image.LANCZOS))
            strip = Image.new("RGB", (W, sum(i.height for i in imgs)))
            y = 0
            for k, im in enumerate(imgs):
                strip.paste(im, (0, y))
                coords[start + k][kind] = [n, y, im.height]
                y += im.height
            strip.save(dest / f"{kind}{n}.jpg", quality=cfg["quality"], optimize=True, progressive=True)
    stamp_file.write_text(json.dumps({"stamp": stamp, "coords": coords}))
    return coords


def page(data, title):
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    fonts = "\n".join(re.findall(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts[^>]+>', html))
    body = re.search(r'<body>(.*?)<script src="assets/app.js"></script>', html, re.S).group(1)
    css = (ROOT / "assets" / "styles.css").read_text(encoding="utf-8")
    js = (ROOT / "assets" / "app.js").read_text(encoding="utf-8")
    blob = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return (f"<title>{title}</title>\n{fonts}\n<style>\n{css}</style>\n{body}"
            f'<script type="application/json" id="site-data">{blob}</script>\n<script>\n{js}</script>\n')


def short(d):
    _, m, dd = d.split("-")
    return f"{int(m)}/{int(dd)}"


def build_game(site, gid, force):
    ev = next((e for e in site["events"] if e["id"] == gid), None)
    if not ev:
        raise SystemExit(f"No gallery with id {gid}")
    coords = build_strips(ev, force)
    for p, c in zip(ev["photos"], coords):
        p.update(c)
        p.pop("file", None)
    ev.pop("url", None)
    data = {"mode": "game", "config": site["config"], "hubUrl": site["config"].get("hubUrl", ""),
            "strips": {k: v["width"] for k, v in STRIPS.items()}, "events": [ev]}
    out = OUT / f"game-{gid}.html"
    name = ev["title"] if ev.get("dateInTitle") is False else f"{ev['title']} {short(ev['date'])}"
    out.write_text(page(data, name), encoding="utf-8")
    files = sorted((p.relative_to(OUT).as_posix() for p in (OUT / "s" / gid).glob("*.jpg")),
                   key=lambda f: (f.split("/")[-1][0] != "t", int(re.sub(r"\D", "", f.split("/")[-1]))))
    total = sum((OUT / f).stat().st_size for f in files)
    print(f"{out.name}: {len(files)} strip files, {total / 1e6:.1f} MB (limits 511 files / 256 MB)")
    return files


def build_hub(site):
    (OUT / "covers").mkdir(exist_ok=True)
    events, files = [], []
    for ev in site["events"]:
        if not ev.get("url"):
            print(f"  not on the home page yet (no artifact url): {ev['id']}")
            continue
        cover = ev["photos"][ev.get("cover", 0)]["file"]
        im = Image.open(ROOT / "photos" / ev["id"] / "thumbs" / cover).convert("RGB")
        im.thumbnail((720, 720), Image.LANCZOS)
        name = f"covers/{ev['id']}.jpg"
        im.save(OUT / name, quality=78, optimize=True, progressive=True)
        files.append(name)
        keep = {k: ev[k] for k in ("id", "title", "date", "category", "code", "url", "sample", "dateInTitle") if k in ev}
        events.append(keep | {"count": len(ev["photos"]), "coverSrc": name, "photos": []})
    data = {"mode": "hub", "config": site["config"], "events": events}
    (OUT / "index.html").write_text(page(data, site["config"]["name"]), encoding="utf-8")
    print(f"index.html: {len(events)} games")
    return files


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["game", "hub"])
    ap.add_argument("id", nargs="?")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    site = json.loads((ROOT / "data" / "site.json").read_text(encoding="utf-8"))
    OUT.mkdir(exist_ok=True)
    (OUT / "assets").mkdir(exist_ok=True)
    for name in ("logo.png", "badge.png"):
        shutil.copyfile(ROOT / "assets" / name, OUT / "assets" / name)
    files = build_game(site, a.id, a.force) if a.mode == "game" else build_hub(site)
    print(json.dumps(["assets/logo.png", "assets/badge.png"] + files))


if __name__ == "__main__":
    main()
