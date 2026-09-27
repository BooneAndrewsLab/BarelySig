#!/usr/bin/env python3
"""Builds the UI font from design/fonts/Archivo[wdth,wght].ttf (item 25,
#58): the same family the wordmark uses (scripts/make-wordmark.py),
bundled this time as a real webfont instead of outlined paths, so the
interface matches the layout mockups on every machine.

Pins the width axis to 100 (upright, not the wordmark's condensed 88) and
keeps weight variable, so one file covers every font-weight the UI uses
(400-700) without shipping several static instances.

Writes:
  public/fonts/archivo-ui.woff2   subset to Latin, Latin-1, Latin
                                  Extended-A and the punctuation/symbols
                                  the interface's own strings use

Needs: fonttools[woff] brotli (e.g. `~/Programs/miniconda3/envs/cluster/bin/python`).
"""
import os
import sys

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SOURCE = os.path.join(ROOT, "design/fonts/Archivo[wdth,wght].ttf")
OUT = os.path.join(ROOT, "public/fonts/archivo-ui.woff2")

# Weight range the interface actually sets (theme.css, help.css run from
# 400 to 700); a little slack on each side keeps synthetic-bold-adjacent
# values (e.g. 650) from clamping right at the edge of the axis.
WGHT_MIN = 380
WGHT_MAX = 720

# Printable ASCII, Latin-1 and Latin Extended-A (accented names, Å  etc.),
# plus the punctuation and symbols the UI's own copy uses (bullets, en/em
# dash, curly quotes, ellipsis, minus, ≥, µ, ² …). Archivo has no Greek or
# geometric-shapes glyphs (the disclosure triangles fall back to the
# system font, same as any other subset webfont missing a glyph).
RANGES = [(0x20, 0x7E), (0xA0, 0xFF), (0x100, 0x17F)]
EXTRA = "–—‘’“”•…′″‰€−×÷±≈≠≤≥∞√∆∑µ°²³¹⁰⁴⁵⁶⁷⁸⁹⁻⁺₀₁₂₃₄₅₆₇₈₉"


def codepoints():
    cps = set()
    for lo, hi in RANGES:
        cps.update(range(lo, hi + 1))
    cps.update(ord(c) for c in EXTRA)
    return sorted(cps)


def main():
    cps = codepoints()
    os.makedirs(os.path.join(ROOT, "public/fonts"), exist_ok=True)
    # Partial instancing: pin wdth, leave wght variable so the one file
    # serves every weight the interface uses.
    font = instantiateVariableFont(TTFont(SOURCE), {"wdth": 100})
    fvar = font["fvar"]
    for axis in fvar.axes:
        if axis.axisTag == "wght":
            axis.minValue = WGHT_MIN
            axis.maxValue = WGHT_MAX
    cmap = font.getBestCmap()
    opts = Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    sub = Subsetter(opts)
    sub.populate(unicodes=[cp for cp in cps if cp in cmap])
    sub.subset(font)
    font.flavor = "woff2"
    font.save(OUT)
    print(OUT, os.path.getsize(OUT), "bytes", file=sys.stderr)


if __name__ == "__main__":
    main()
