import { test, expect } from '@playwright/test';
import { resolve } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';

// Panel napisów: otwiera się po prawej (jak kolejka), ma listę ścieżek, kontrolkę
// opóźnienia i sekcję wyszukiwania online. Fixture to mały WebM (bez napisów), więc
// testuje się UI panelu — bez sieci.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

const FIXTURE_DIR = resolve(__dirname, 'fixtures');
const FIXTURE_FILE = resolve(FIXTURE_DIR, 'sample.webm');

test.describe('subtitle panel', () => {
  test('opens beside the player with tracks, delay control and online search', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);

      const scanned = await page.evaluate(async (dir) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.invoke('library:saveFolders', [dir]);
        const result = (await api.invoke('library:scan', [dir])) as { count?: number } | undefined;
        return result?.count ?? 0;
      }, FIXTURE_DIR);
      expect(scanned).toBeGreaterThan(0);
      await page.waitForTimeout(1000);

      await page.reload();
      await dismissWizard(page);
      await page.evaluate(async (path) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.grantMediaAccess(path);
      }, FIXTURE_FILE);

      await page.evaluate(() => {
        window.location.hash = '#/library';
      });
      await page.getByTestId('library-tab-video').click();
      const card = page.getByTestId('video-card').first();
      await expect(card).toBeVisible({ timeout: 15_000 });
      await card.click();
      await expect(page.getByTestId('player-view')).toBeVisible();

      const panel = page.getByTestId('subtitle-panel');
      await expect(panel).toHaveCount(0);

      await page.getByTestId('subtitle-button').click();
      await expect(panel).toBeVisible();

      // Opóźnienie: +/− zmieniają wartość, klik wartości zeruje.
      const value = panel.getByTestId('subtitle-delay-value');
      await expect(value).toHaveText('0 ms');
      await panel.getByTestId('subtitle-delay-up').click();
      await expect(value).toHaveText('+50 ms');
      await panel.getByTestId('subtitle-delay-down').click();
      await expect(value).toHaveText('0 ms');

      // Sekcja online (OpenSubtitles + NapiProjekt) jest widoczna.
      await expect(panel.getByTestId('subtitle-online-search')).toBeVisible();

      // Zamknięcie przyciskiem X.
      await panel.getByTestId('subtitle-panel-close').click();
      await expect(panel).toHaveCount(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
