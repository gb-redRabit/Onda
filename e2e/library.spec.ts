import { test, expect } from '@playwright/test';
import { rmSync } from 'fs';
import { launchOnda, dismissWizard } from './helpers/app';
import { createMediaFixture } from './helpers/media';

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

test.describe('library scan and playback', () => {
  const media = createMediaFixture();

  test.afterAll(() => {
    rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('scans a folder and plays a generated WAV through the player bar', async () => {
    const onda = await launchOnda();
    try {
      await expect(onda.page.getByTestId('app-root')).toBeVisible();
      await dismissWizard(onda.page);

      // Persist the folder and run the real main-process scan (the native folder
      // picker is not automatable; every other step is the production path).
      const scanned = await onda.page.evaluate(async (dir) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.invoke('library:saveFolders', [dir]);
        const result = (await api.invoke('library:scan', [dir])) as { count?: number } | undefined;
        return result?.count ?? 0;
      }, media.dir);
      expect(scanned).toBeGreaterThan(0);

      // Let the debounced library-scanned.json flush, then boot the library again.
      await onda.page.waitForTimeout(1000);
      await onda.page.evaluate(() => localStorage.setItem('onda.libraryTab', 'tracks'));
      await onda.page.reload();
      await expect(onda.page.getByTestId('app-root')).toBeVisible();
      await dismissWizard(onda.page);
      await onda.page.evaluate(() => {
        window.location.hash = '#/library';
      });

      const track = onda.page.getByTestId('library-track').first();
      await expect(track).toBeVisible();
      await expect(track).toContainText(/tone/i);

      await onda.page.evaluate(async (path) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.grantMediaAccess(path);
      }, media.wavPath);

      await onda.page.getByTestId('library-track-play').first().click();
      await expect(
        onda.page.locator('[data-testid="player-bar"][data-playing="true"]')
      ).toBeVisible({ timeout: 20_000 });

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
