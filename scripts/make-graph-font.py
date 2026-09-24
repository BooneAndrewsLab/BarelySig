#!/usr/bin/env python3
"""Builds the graph font from design/fonts/Arimo[wght].ttf (item 05).

Arimo (SIL OFL 1.1) has Arial's metrics, so an exported SVG that names
Arial first lays out the same where Arial is installed (Illustrator, most
journals), and Arimo itself is embedded wherever we rasterise (PNG).

Writes, for weights 400 and 700:
  public/fonts/arimo-<weight>.woff      subset to Latin, Latin-1, Greek and
                                        the symbols figures use (µ ± − ° ² …)
  src/graphs/text/metrics.json          advance widths per code point, so
                                        layout measures text without a DOM

Needs: fonttools (e.g. `~/Programs/miniconda3/envs/cluster/bin/python`).
"""
import json
import os
import sys

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SOURCE = os.path.join(ROOT, "design/fonts/Arimo[wght].ttf")

# Printable ASCII, Latin-1, Latin Extended-A, Greek, and the punctuation and
# symbols of axis titles and P values.
RANGES = [(0x20, 0x7E), (0xA0, 0xFF), (0x100, 0x17F), (0x391, 0x3C9)]
EXTRA = "–—‘’“”•…′″‰€−×÷±≈≠≤≥∞√∆∑µ°²³¹⁰⁴⁵⁶⁷⁸⁹⁻⁺₀₁₂₃₄₅₆₇₈₉"


def codepoints():
    cps = set()
    for lo, hi in RANGES:
        cps.update(range(lo, hi + 1))
    cps.update(ord(c) for c in EXTRA)
    return sorted(cps)


def main():
    cps = codepoints()
    metrics = {}
    os.makedirs(os.path.join(ROOT, "public/fonts"), exist_ok=True)
    for weight in (400, 700):
        font = instantiateVariableFont(TTFont(SOURCE), {"wght": weight})
        cmap = font.getBestCmap()
        hmtx = font["hmtx"]
        widths = {str(cp): hmtx[cmap[cp]][0] for cp in cps if cp in cmap}
        head = font["head"]
        hhea = font["hhea"]
        metrics[str(weight)] = {"advances": widths}
        metrics["unitsPerEm"] = head.unitsPerEm
        metrics["ascender"] = hhea.ascent
        metrics["descender"] = hhea.descent
        opts = Options()
        opts.flavor = "woff"
        opts.layout_features = ["kern", "liga"]
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        sub = Subsetter(opts)
        sub.populate(unicodes=[cp for cp in cps if cp in cmap])
        sub.subset(font)
        font.flavor = "woff"
        out = os.path.join(ROOT, f"public/fonts/arimo-{weight}.woff")
        font.save(out)
        print(out, os.path.getsize(out), "bytes", file=sys.stderr)
    with open(os.path.join(ROOT, "src/graphs/text/metrics.json"), "w") as f:
        json.dump(metrics, f, separators=(",", ":"), sort_keys=True)
        f.write("\n")


if __name__ == "__main__":
    main()
