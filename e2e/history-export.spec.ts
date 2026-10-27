import { test, expect } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';

test('history export writes CSV and JSON files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'onda-history-export-e2e-'));
  const csvPath = join(dir, 'history.csv');
  const jsonPath = join(dir, 'history.json');

  const onda = await launchOnda();
  const { page } = onda;
  try {
    await dismissWizard(page);
    await page.evaluate(() => {
      window.location.hash = '#/tools';
    });
    await expect(page.getByTestId('tools-hub')).toBeVisible();
    const [tool] = await Promise.all([
      onda.app.waitForEvent('window'),
      page.getByTestId('tools-card-history-export').click()
    ]);
    tool.on('pageerror', (error) => onda.pageErrors.push(error.message));
    await dismissWizard(tool);
    await expect(tool.getByTestId('history-export-view')).toBeVisible();

    // CSV
    await tool.getByTestId('history-export-output').fill(csvPath);
    await tool.getByTestId('history-export-run').click();
    await expect(tool.getByTestId('history-export-result')).toBeVisible({ timeout: 15_000 });
    expect(existsSync(csvPath)).toBe(true);
    const csv = readFileSync(csvPath, 'utf-8');
    expect(csv.startsWith('\uFEFFtitle,artist,album,albumArtist,genre,year,type,duration')).toBe(
      true
    );

    // JSON
    await tool.getByTestId('history-export-format').selectOption('json');
    await tool.getByTestId('history-export-output').fill(jsonPath);
    await tool.getByTestId('history-export-run').click();
    await expect.poll(() => existsSync(jsonPath), { timeout: 15_000 }).toBe(true);
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    expect(Array.isArray(parsed)).toBe(true);

    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
