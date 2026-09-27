/**
 * The workflow a bench scientist follows (#35): paste a block from a
 * spreadsheet → t test → bar graph with asterisks → export SVG and PNG →
 * download the project, reload, reopen it.
 */
import { readFileSync } from 'node:fs';

import { type Page, expect, test } from '@playwright/test';

/** Two groups as Excel copies them: tab-separated, a header row, CRLF line ends. */
const BLOCK = ['Vehicle\tDrug', '98.2\t61.7', '101.5\t58.4', '99.1\t63.0', '97.4\t60.2', ''].join(
  '\r\n',
);

async function paste(page: Page, text: string): Promise<void> {
  // What a paste delivers to the page: a paste event carrying the clipboard.
  await page.getByRole('grid').evaluate((grid, t) => {
    const data = new DataTransfer();
    data.setData('text/plain', t);
    grid.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  }, text);
}

/**
 * The figure's picture (painted by the worker, item 11) once drawn, and
 * the parts the Format list offers: the picture has no shapes to read.
 */
async function figureParts(page: Page, name: RegExp): Promise<string[]> {
  const figure = page.getByRole('img', { name });
  const section = page.locator('.graph-section').filter({ has: figure });
  await expect(section.locator('.graph-canvas')).toHaveAttribute('aria-busy', 'false');
  await expect
    .poll(() => figure.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  const format = section.getByRole('button', { name: 'Format', exact: true });
  if ((await format.getAttribute('aria-pressed')) !== 'true') await format.click();
  const list = section.locator('.inspector-pick select');
  await expect(list).toBeVisible();
  const parts = await list.locator('option').allTextContents();
  await format.click();
  return parts;
}

test.beforeEach(async ({ page }) => {
  // Downloads go through an <a download> the test can catch, as in Firefox.
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
});

test('paste, test, graph, export, save and reopen', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Column table/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill('Viability');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();

  // Paste: the header row names the groups.
  // Paste at the first cell, where a user would click.
  await page.getByRole('grid').click();
  await page.keyboard.press('Control+Home');
  await paste(page, BLOCK);
  await expect(page.getByRole('columnheader', { name: /Vehicle/ })).toBeVisible();
  await expect(page.getByRole('gridcell', { name: /63/ }).first()).toBeVisible();

  // A t test, chosen by Help me choose (note 15) and run by R in the browser.
  await page.getByRole('button', { name: 'Analyze…' }).click();
  const analyze = page.getByRole('dialog');
  await analyze.getByRole('button', { name: /^Whether the groups differ/ }).click();
  await analyze.getByRole('button', { name: 'Continue' }).click();
  await analyze.getByRole('button', { name: /^No, every value is a separate sample/ }).click();
  await analyze.getByRole('button', { name: /^Measurements on a smooth scale/ }).click();
  await expect(analyze.getByRole('heading', { name: 'Unpaired t test' })).toBeVisible();
  await analyze.getByRole('button', { name: 'Run this test' }).click();
  // The results are a section of the experiment's page, under the data.
  await expect(page.getByRole('heading', { level: 2, name: /t test of Viability/ })).toBeVisible();
  await expect(page.getByText('P < 0.0001').first()).toBeVisible({ timeout: 150_000 });

  // A bar graph of the table draws the test's bracket.
  await page.getByRole('button', { name: 'New graph' }).click();
  await expect
    .poll(() => figureParts(page, /Viability: Bars: mean ± SD/))
    .toEqual(
      expect.arrayContaining(['Data set: Vehicle', 'Data set: Drug', 'Bracket: Vehicle vs. Drug']),
    );

  // SVG export, with its recipe.
  await page.getByRole('button', { name: 'Export…' }).click();
  const svgDownload = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Export SVG' }).click();
  const svg = await svgDownload;
  expect(svg.suggestedFilename()).toBe('Viability.svg');
  const svgText = readFileSync(await svg.path(), 'utf8');
  expect(svgText).toContain('<barelysig:recipe');
  expect(svgText).toMatch(/width="70mm"/);
  expect(svgText).toContain('>****</text>');
  expect(svgText.match(/data-role="bar"/g)).toHaveLength(2);

  // PNG export at 600 DPI: the signature, the DPI chunk and the recipe.
  await page.getByRole('button', { name: 'Export…' }).click();
  const exportDialog = page.getByRole('dialog');
  await exportDialog.getByRole('radio', { name: /PNG/ }).check();
  await exportDialog.getByRole('combobox').selectOption('600');
  const pngDownload = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Export PNG' }).click();
  const png = readFileSync(await (await pngDownload).path());
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.includes(Buffer.from('pHYs'))).toBe(true);
  expect(png.includes(Buffer.from('barelysig-recipe'))).toBe(true);
  await expect(page.getByRole('button', { name: 'Restore this figure' })).toHaveCount(2);

  // Download the project.
  const bsigDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const bsig = await bsigDownload;
  const bsigPath = await bsig.path();
  expect(JSON.parse(readFileSync(bsigPath, 'utf8'))).toMatchObject({ format: 'barelysig' });
  await expect(page.getByText('Downloaded', { exact: true })).toBeVisible();

  // Reload: the project comes back from the browser, results and all.
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Experiments' })).toContainText('Viability');
  await page
    .getByRole('navigation', { name: 'On this page' })
    .getByRole('button', { name: /t test of Viability/ })
    .click();
  await expect(page.getByText('P < 0.0001').first()).toBeVisible();

  // Reopen the downloaded file: a new project with the same graph.
  await page.locator('input[type="file"]').setInputFiles({
    name: 'Viability.bsig',
    mimeType: 'application/json',
    buffer: readFileSync(bsigPath),
  });
  await expect(page.getByText('Opened “Viability.bsig”.')).toBeVisible();
  await expect.poll(() => figureParts(page, /Viability/)).toContain('Bracket: Vehicle vs. Drug');

  // The exported SVG reopens as the figure it was.
  await page.locator('input[type="file"]').setInputFiles({
    name: 'Viability.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svgText),
  });
  await expect(page.getByText(/Opened the figure “Viability.svg”/)).toBeVisible();
  expect(
    (await figureParts(page, /Viability/)).filter((x) => x.startsWith('Data set:')),
  ).toHaveLength(2);
});
