/**
 * Opening a data file (#60): the file is read in a worker (SheetJS for
 * spreadsheets, loaded on first use), the layout guessed and previewed,
 * and Create makes the experiment.
 */
import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

test('a CSV of long data becomes a Column table', async ({ page }) => {
  await page.goto('./');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'weights.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Mouse,Genotype,Weight (g)\n1,WT,20.5\n2,KO,18\n3,WT,21\n4,KO,17.5\n'),
  });
  const dialog = page.getByRole('dialog', { name: 'Open data file' });
  await expect(dialog.getByRole('radio', { name: /One row per measurement/ })).toBeChecked();
  await expect(dialog.getByRole('table', { name: 'Preview' })).toContainText('20.5');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('Opened “weights.csv” as a new experiment: 4 values.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'weights' })).toBeVisible();
  await expect(page.getByRole('grid')).toContainText('17.5');
});

test('an .xlsx with merged titles becomes a Grouped table', async ({ page }) => {
  await page.goto('./');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'workbook.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: readFileSync('src/io/import/fixtures/workbook.xlsx'),
  });
  const dialog = page.getByRole('dialog', { name: 'Open data file' });
  const sheet = dialog.getByRole('combobox', { name: 'Sheet' });
  await expect(sheet).toBeVisible();
  await sheet.selectOption({ label: 'Grouped' });
  await expect(dialog.getByRole('radio', { name: /two factors/ })).toBeChecked();
  await expect(dialog.getByText(/Grouped table · 3 replicates per cell · 2 groups/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Grouped' })).toBeVisible();
});
