#!/usr/bin/env python3
"""One-time: cut the livery-variant top-down sprites and the new MP-only
anahita car (top-down + 3/4 hero) out of their green-screen backgrounds, and
crop to the bounding box. Mirrors scripts/cutout-topdown.py.

Engine convention: heading 0 = +x (east). The 14 variant sources already face
RIGHT (nose +x), so no rotation. `206-Anahita Version.png` faces UP (north)
like the original top-down sources, so it is rotated 90 CW so the nose points
+x. `206-anahita-hero.png` is a 3/4 hero shot and gets no rotation.

Pipeline (top-down): rembg (u2net) -> green despill -> [rotate 90 CW] -> crop bbox.
Pipeline (hero):      rembg (u2net) -> green despill -> crop bbox.

Deps: pip install --user "rembg[cpu]" onnxruntime pillow numpy
Run:  python3 scripts/cutout-variants.py
      (writes cars/output/generated/variants/, which
       scripts/optimize-assets.mjs then encodes to
       public/assets/cars/top/variants + top + hero)
"""
import numpy as np
from rembg import remove
from PIL import Image

SRC = "cars/green/variants"
OUT = "cars/output/generated/variants"

# livery-variant top-down sources (already face +x/right, no rotation)
VARIANT_JOBS = [
    ("jackal-a-ivory-courier.png", "jackal-a"),
    ("jackal-b-azure-scrap-runner.png", "jackal-b"),
    ("vandal-a-saffron-street-brawler.png", "vandal-a"),
    ("vandal-b-cobalt-copper-outlaw.png", "vandal-b"),
    ("marauder-a-oxide-gunmetal-bruiser.png", "marauder-a"),
    ("marauder-b-desert-lapis-enforcer.png", "marauder-b"),
    ("harrier-a-bone-cobalt-interceptor.png", "harrier-a"),
    ("harrier-b-black-saffron-pursuit.png", "harrier-b"),
    ("basilisk-a-cobalt-salt-raider.png", "basilisk-a"),
    ("basilisk-b-violet-brass-ravager.png", "basilisk-b"),
    ("leviathan-a-obsidian-crimson-fortress.png", "leviathan-a"),
    ("leviathan-b-desert-teal-bulwark.png", "leviathan-b"),
    ("sovereign-a-oxblood-black-champion.png", "sovereign-a"),
    ("sovereign-b-ivory-lapis-imperator.png", "sovereign-b"),
]

# anahita (MP-only car): top-down source faces UP/north -> rotate 90 CW
ANAHITA_TOP = ("206-Anahita Version.png", "anahita")

# anahita 3/4 hero shot (hero-style, no rotation)
ANAHITA_HERO = ("206-anahita-hero.png", "anahita")


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
    for src, cid in VARIANT_JOBS:
        im = crop_bbox(cut(src))
        im.save(f"{OUT}/car_top_{cid}.png")
        print(f"top  {cid:14s} <- {src:45s} {im.size}")

    src, cid = ANAHITA_TOP
    # PIL.rotate is CCW for positive angles; -90 = 90 CW so the north-facing
    # nose ends up pointing +x.
    im = crop_bbox(cut(src).rotate(-90, expand=True))
    im.save(f"{OUT}/car_top_{cid}.png")
    print(f"top  {cid:14s} <- {src:45s} {im.size}")

    src, cid = ANAHITA_HERO
    im = crop_bbox(cut(src))
    im.save(f"{OUT}/car_hero_{cid}.png")
    print(f"hero {cid:14s} <- {src:45s} {im.size}")

    print(f"done: {len(VARIANT_JOBS)} variants + 1 anahita top-down + 1 anahita hero")


if __name__ == "__main__":
    main()
