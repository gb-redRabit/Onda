import { test, expect } from '@playwright/test';
import { rmSync } from 'fs';
import { launchOnda, dismissWizard } from './helpers/app';
import { createMediaFixture } from './helpers/media';

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

test.describe('smart playlists', () => {
  const media = createMediaFixture();

  test.afterAll(() => {
    rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('creates a rule-based playlist and shows its live tracks', async () => {
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
      expect(scanned).toBeGreaterThan(0);
      await page.waitForTimeout(1000);
      await page.reload();
      await dismissWizard(page);
      await page.evaluate(async (path) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.grantMediaAccess(path);
      }, media.wavPath);

      await page.evaluate(() => {
        window.location.hash = '#/library?tab=smart';
      });
      await expect(page.getByTestId('library-smart-tab')).toBeVisible();

      await page.getByTestId('smart-playlist-new').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByTestId('smart-playlist-name').fill('Test smart');
      await expect(page.getByTestId('smart-playlist-preview')).toContainText('1');
      await page.getByTestId('smart-playlist-save').click();

      const item = page.getByTestId(/^smart-playlist-smart-/).first();
      await expect(item).toContainText('Test smart');
      await expect(item).toContainText('1');

      await item.click();
      await expect(page.getByTestId('library-track').first()).toBeVisible();

      // Zapis jest debounce'owany — odczekaj i sprawdź trwałość po reloadzie.
      await page.waitForTimeout(700);
      await page.reload();
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/library?tab=smart';
      });
      await expect(page.getByTestId(/^smart-playlist-smart-/).first()).toContainText('Test smart');

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
