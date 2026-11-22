import { test, expect } from '@playwright/test';
import { copyFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';

// Regresja: dwuklik na pliku wideo w Eksploratorze ma otworzyć odtwarzacz.
test.skip(
  process.platform === 'darwin',
  'macOS runner: Electron exits during explorer item double-click (SIGTRAP pattern)'
);

test('opens a video from the explorer in the player', async () => {
  test.slow();
  const dir = mkdtempSync(join(tmpdir(), 'onda-explorer-video-'));
  const video = join(dir, 'sample.webm');
  copyFileSync(resolve(__dirname, 'fixtures', 'sample.webm'), video);

  const onda = await launchOnda();
  const { page } = onda;
  try {
    await dismissWizard(page);
    await page.evaluate((folder) => {
      window.location.hash = `#/explorer/window/e2e?path=${encodeURIComponent(folder)}`;
    }, dir);

    const item = page.getByTestId('explorer-item-sample.webm');
    await expect(item).toBeVisible({ timeout: 15_000 });
    await item.dblclick();

    await expect
      .poll(() => page.evaluate(() => window.location.hash), { timeout: 15_000 })
      .toBe('#/player');
    await expect(page.getByTestId('player-view')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('player-view').locator('video').first()).toBeVisible();
    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
  }
});
