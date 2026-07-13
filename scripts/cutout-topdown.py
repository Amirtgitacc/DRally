#!/usr/bin/env python3
"""One-time (Project B): cut the 7 top-down Iranian race cars out of their
green-screen backgrounds, rotate them into the engine's facing convention, and
crop to the bounding box. Also cuts the boss 3/4 hero for the pre-duel reveal
(no rotation).

Engine convention: heading 0 = +x (east). Sources face UP (north), so top-down
cars are rotated 90 CW so the nose points +x; the existing rotation code then
needs no change. If a car drives sideways in-browser, flip -90 -> 90 here.

Pipeline (top-down): rembg (u2net) -> green despill -> rotate 90 CW -> crop bbox.
Pipeline (boss hero): rembg -> green despill -> crop bbox.

Deps: pip install --user "rembg[cpu]" onnxruntime pillow numpy
Run:  python3 scripts/cutout-topdown.py
      (writes cars/output/generated/, which scripts/optimize-assets.mjs then
       encodes to public/assets/cars/top + public/assets/cars/hero)
"""
import numpy as np
from rembg import remove
from PIL import Image

SRC = "cars/green"
OUT = "cars/output/generated"

# game chassis id -> top-down source (nose points UP/north in the source)
TOP_JOBS = [
    ("Pride4.png", "jackal"),
    ("taxi peykan2.png", "vandal"),
    ("Cielo Dawoo.png", "marauder"),
    ("405.png", "harrier"),
    ("nissan vanet.png", "basilisk"),
    ("Patrol nissan.png", "leviathan"),
    ("Sovereign2.png", "sovereign"),
]

# boss 3/4 hero for the pre-duel reveal (hero-style, no rotation)
HERO_JOBS = [
    ("Sovereign.png", "sovereign"),
]


def despill(im: Image.Image) -> Image.Image:
    """Clamp green where it is the dominant channel (screen bleed)."""
    a = np.asarray(im.convert("RGBA")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    a[..., 1] = np.where(g > np.maximum(r, b), np.maximum(r, b), g)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def cut(src: str) -> Image.Image:
    return despill(remove(Image.open(f"{SRC}/{src}")))


def crop_bbox(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def main() -> None:
    for src, cid in TOP_JOBS:
        # PIL.rotate is CCW for positive angles; -90 = 90 CW so the north-facing
        # nose ends up pointing +x. Flip to rotate(90) if cars drive sideways.
        im = crop_bbox(cut(src).rotate(-90, expand=True))
        im.save(f"{OUT}/car_top_{cid}.png")
        print(f"top  {cid:10s} <- {src:22s} {im.size}")
    for src, cid in HERO_JOBS:
        im = crop_bbox(cut(src))
        im.save(f"{OUT}/car_hero_{cid}.png")
        print(f"hero {cid:10s} <- {src:22s} {im.size}")
    print("done: 7 top-down + 1 boss hero")


if __name__ == "__main__":
    main()
