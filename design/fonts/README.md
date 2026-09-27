# Fonts

Two self-hosted, subsetted webfonts (design note 25: no third-party CDN,
same distinction the graph font already drew — item 03's "no webfonts"
meant no *third-party-hosted* fonts).

## Graph font: Arimo

Arimo, by the Arimo Project Authors, under the SIL Open Font License 1.1
(`Arimo-OFL.txt`), from google/fonts `ofl/arimo` (`Arimo-METADATA.pb`).
Metrically compatible with Arial (design note 05).

`scripts/make-graph-font.py` builds the subset WOFF files in
`public/fonts/` and the advance-width table in
`src/graphs/text/metrics.json` from `Arimo[wght].ttf`.

## UI font: Archivo

Archivo, by the Archivo Project Authors, under the SIL Open Font License
1.1 (`Archivo-OFL.txt`), from https://github.com/Omnibus-Type/Archivo —
the same family the wordmark uses (`design/logo/README.md`,
`scripts/make-wordmark.py`).

`scripts/make-ui-font.py` builds the subset WOFF2 files in
`public/fonts/` from `Archivo[wdth,wght].ttf` (design note 25, #58).
