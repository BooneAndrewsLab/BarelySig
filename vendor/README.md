# Vendored packages

Installed from here, not from a registry, so neither `npm install` nor the
app ever fetches them from a CDN.

| File              | Package                          | Licence    | SHA-256                                                            |
| ----------------- | -------------------------------- | ---------- | ------------------------------------------------------------------ |
| `xlsx-0.20.3.tgz` | SheetJS Community Edition 0.20.3 | Apache-2.0 | `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8` |

**SheetJS** reads spreadsheet files for "Open data file" (design note 10).
The `xlsx` package on npm stops at 0.18.5, which has known advisories; the
maintained build is published only as a tarball at
`https://cdn.sheetjs.com/xlsx-<version>/xlsx-<version>.tgz`. To update:
download the new tarball here, check it (`sha256sum`), `npm install
--save file:vendor/xlsx-<version>.tgz`, remove the old one, update this
table, and run the workbook tests (`src/io/import/workbook.test.ts`).
