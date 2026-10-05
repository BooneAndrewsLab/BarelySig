<p align="center"><img src="design/logo/barelysig-mark-light.svg" height="72" alt="BarelySig"></p>

# BarelySig

> No license required. Asterisks included.

Free, open-source, fully browser-based statistics and graphing for wet-lab scientists — an alternative to GraphPad Prism. No install, no backend, no account; your data never leaves your computer.

**Use it:** <https://booneandrewslab.github.io/BarelySig/> — works in any
modern browser, installs as an app, and works offline after the first visit.

## What it does

- **Tables** as Prism lays them out: Column tables (a group per column) and
  Grouped tables (two factors), raw replicates or summary data (mean, SD/SEM,
  n). Paste straight from Excel, Google Sheets or LibreOffice.
- **Statistics computed by R** running in your browser (WebR): descriptive
  statistics, t tests (unpaired, Welch, paired, from summary data),
  Mann-Whitney and Wilcoxon with exact P, one-way ANOVA with Tukey, Dunnett,
  Šidák, Bonferroni and Welch's alternatives, Kruskal-Wallis (exact P for
  small samples) with Dunn's test, two-way ANOVA with multiple comparisons,
  and normality tests. Every result is validated against desktop R on
  edge cases, and read out in plain words.
- **Graphs that look publishable untouched:** bars, dot plots, box and
  violin plots, grouped bars, with significance brackets from the
  analyses; click any part to format it; export SVG or PNG at a journal's
  column width.
- **Reproducible figures:** an exported figure carries its data, analyses
  and settings, so opening it in BarelySig gets the exact figure back.
- **Private:** no account, no upload, no server; your data never leave
  your computer.

A user guide is built into the app (the **?** button).

## Citing

See [CITATION.cff](CITATION.cff); GitHub's "Cite this repository" gives it
in APA or BibTeX.

## Development

```sh
npm install
npm run dev       # local dev server
npm run check     # typecheck, lint, format, tests
npm run test:parity # the engine parity suite (check skips it unless analyses/engine changed; PARITY=1 forces)
npm run e2e       # end-to-end tests (Playwright, against a production build)
npm run build     # static build for GitHub Pages
```

## Licence

MIT — see [LICENSE](LICENSE).
