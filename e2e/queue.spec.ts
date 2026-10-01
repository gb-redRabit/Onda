import { test, expect } from '@playwright/test';
import { rmSync, copyFileSync } from 'fs';
import { join } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';
import { createMediaFixture } from './helpers/media';

// Kolejka odtwarzania: "play all" ją wypełnia, a przeciągnij i upuść zmienia kolejność wierszy.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

test.describe('playback queue', () => {
  const media = createMediaFixture();
  const secondFile = join(media.dir, 'tone2.wav');
  const thirdFile = join(media.dir, 'tone3.wav');
  copyFileSync(media.wavPath, secondFile);
  copyFileSync(media.wavPath, thirdFile);

  test.afterAll(() => {
    rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('play all fills the queue and drag & drop reorders it', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      const scanned = await page.evaluate(async (dir) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.invoke('library:saveFolders', [dir]);
        const result = (await api.invoke('library:scan', [dir])) as { count?: number } | undefined;
        return result?.count ?? 0;
      }, media.dir);
      expect(scanned).toBeGreaterThanOrEqual(3);
      await page.waitForTimeout(1000);
      await page.reload();
      await dismissWizard(page);
      for (const path of [media.wavPath, secondFile, thirdFile]) {
        await page.evaluate(async (p) => {
          const api = (window as unknown as { api: OndaTestApi }).api;
          await api.grantMediaAccess(p);
        }, path);
      }

      await page.evaluate(() => {
        window.location.hash = '#/library';
      });
      await page.getByTestId('library-tab-tracks').click();
      await expect(page.getByTestId('library-play-all')).toBeVisible();
      await page.getByTestId('library-play-all').click();
      await expect(page.locator('[data-testid="player-bar"][data-playing="true"]')).toBeVisible({
        timeout: 20_000
      });

      await page.getByTestId('player-queue').click();
      await expect(page.getByTestId('queue-panel')).toBeVisible();
      const row0 = page.getByTestId('queue-row-0');
      const row1 = page.getByTestId('queue-row-1');
      await expect(row0).toBeVisible();
      await expect(row1).toBeVisible();

      const before0 = (await row0.innerText()).trim();
      const before1 = (await row1.innerText()).trim();
      expect(before0).not.toBe(before1);

      // Przeciągnij drugi wiersz na pierwszy: kolejność się zamienia.
      await row1.dragTo(row0);
      await expect.poll(async () => (await row0.innerText()).trim()).toBe(before1);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
