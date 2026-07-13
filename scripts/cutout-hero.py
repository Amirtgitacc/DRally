#!/usr/bin/env python3
"""One-time: cut the 6 Iranian hero cars out of their backgrounds to clean
transparent PNGs for the pre-game screens (Project A).

Pipeline per car:  rembg (u2net) alpha matte  ->  green-spill despill  ->  crop
to bounding box.  rembg alone leaves a green fringe on the green-screen sources
(pride/cielo/nissan); the despill pass removes it.

Deps:  pip install --user "rembg[cpu]" onnxruntime pillow numpy
Run:   python3 scripts/cutout-hero.py    (writes into cars/output/generated/,
       which scripts/optimize-assets.mjs then encodes to public/assets/cars/hero)

Sources live in cars/green/ except harrier, whose gritty 3/4 source did not
exist and was generated (Peugeot-405 war sedan) to match the set.
"""
import numpy as np
from rembg import remove
from PIL import Image

SRC = "cars/green"
OUT = "cars/output/generated"

# game car id  ->  source render
JOBS = [
    ("pride3.png", "jackal"),
    ("taxi peykan.png", "vandal"),
    ("cielo.png", "marauder"),
    ("peugeot405 (generated).png", "harrier"),  # generated to fill the 6th slot
    ("nisasan2.png", "basilisk"),
    ("patrolgreen.png", "leviathan"),
]


def despill(im: Image.Image) -> Image.Image:
    """Where green is the dominant channel (screen bleed), clamp it to the max
    of red/blue. Genuine, non-green-dominant colour is left intact."""
    a = np.asarray(im.convert("RGBA")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    a[..., 1] = np.where(g > np.maximum(r, b), np.maximum(r, b), g)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def main() -> None:
    for src, cid in JOBS:
        cut = despill(remove(Image.open(f"{SRC}/{src}")))
        bbox = cut.getbbox()
        if bbox:
            cut = cut.crop(bbox)
        cut.save(f"{OUT}/car_hero_{cid}.png")
        print(f"{cid:10s} <- {src:28s} {cut.size}")
    print("done: 6 hero cutouts")


if __name__ == "__main__":
    main()
