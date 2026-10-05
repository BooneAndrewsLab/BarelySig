<p align="center"><img src="design/logo/barelysig-mark-light.svg" height="72" alt="BarelySig"></p>

# BarelySig

> No license required. Asterisks included.

Free, open-source, fully browser-based statistics and graphing for wet-lab scientists — an alternative to GraphPad Prism. No install, no backend, no account; your data never leaves your computer.

**Use it:** <https://booneandrewslab.github.io/BarelySig/> — works in any
modern browser, installs as an app, and works offline after the first visit.

## What it does

- **Tables** as Prism lays them out: Column (a group per column), Grouped
  (two factors), Nested (replicates within experiments, for SuperPlots),
  XY and Contingency tables, raw replicates or summary data (mean, SD/SEM,
  n). Paste straight from Excel, Google Sheets or LibreOffice, or open a
  spreadsheet file and let it guess the layout; normalize to a control.
- **Statistics computed by R** running in your browser (WebR): descriptive
  statistics; t tests (unpaired, Welch, paired, from summary data),
  Mann-Whitney and Wilcoxon with exact P; one-way ANOVA with Tukey,
  Dunnett, Šidák, Bonferroni, Games-Howell and Welch's alternatives,
  Kruskal-Wallis with Dunn's test; two-way ANOVA with multiple comparisons;
  repeated-measures one- and two-way ANOVA and Friedman; nested t tests
  and ANOVA; chi-square and Fisher's exact tests; Pearson and Spearman
  correlation, linear regression, nonlinear regression (dose-response and
  growth-curve models, constraints, global fits, model comparison,
  profile-likelihood intervals, interpolation) and normality tests.
  "Help me choose" picks a test from a few questions about the experiment.
  Every result is validated against desktop R on edge cases, and read out
  in plain words.
- **Graphs that look publishable untouched:** bars, dot plots, box and
  violin plots, grouped bars, SuperPlots, XY scatter with fitted curves,
  connected lines, replicate traces or a mean ± error band, with
  significance brackets from the analyses; click any part to format it;
  export SVG or PNG at a journal's column width.
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
