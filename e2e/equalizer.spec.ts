import { test, expect } from '@playwright/test';
import { rmSync } from 'fs';
import { launchOnda, dismissWizard } from './helpers/app';
import { createMediaFixture } from './helpers/media';

// Equalizer: otwierany z paska odtwarzacza, presety stosują się do pasm, a każde
// pasmo obsługuje się z klawiatury.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

test.describe('equalizer', () => {
  const media = createMediaFixture();

  test.afterAll(() => {
    rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('applies presets and edits a band with the keyboard', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(async (dir) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.invoke('library:saveFolders', [dir]);
        await api.invoke('library:scan', [dir]);
      }, media.dir);
      await page.waitForTimeout(1000);
      await page.reload();
      await dismissWizard(page);
      await page.evaluate(async (path) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.grantMediaAccess(path);
      }, media.wavPath);

      await page.evaluate(() => {
        window.location.hash = '#/library';
      });
      await page.getByTestId('library-tab-tracks').click();
      await page.getByTestId('library-track-play').first().click();
      await expect(
        page.locator('[data-testid="player-bar"][data-playing="true"]')
      ).toBeVisible({ timeout: 20_000 });

      await page.getByTestId('player-eq').click();
      await expect(page.getByTestId('equalizer')).toBeVisible();
      await expect(page.getByTestId('eq-band-0')).toBeVisible();
      await expect(page.getByTestId('eq-preset-flat')).toBeVisible();

      // Preset Bass wypycha niskie pasmo do +8 dB.
      await page.getByTestId('eq-preset-bassBoost').click();
      await expect(page.getByTestId('eq-band-0')).toHaveAttribute('aria-valuenow', '8');
      await expect(page.getByTestId('eq-band-9')).toHaveAttribute('aria-valuenow', '0');

      // Klawiatura: ArrowUp na zaznaczonym paśmie podnosi je o 1 dB.
      const band9 = page.getByTestId('eq-band-9');
      await band9.focus();
      await band9.press('ArrowUp');
      await expect(band9).toHaveAttribute('aria-valuenow', '1');

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
