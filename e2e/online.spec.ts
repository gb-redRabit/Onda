import { test, expect } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

test.describe('online search and download queue', () => {
  test('runs a search against fixture results and shows the queued download', async () => {
    // ONDA_E2E_FIXTURES makes yt:search return canned items and yt:download:add
    // return a simulated queue (no yt-dlp/network), while the UI paths stay real.
    const onda = await launchOnda({ env: { ONDA_E2E_FIXTURES: '1' } });
    try {
      await expect(onda.page.getByTestId('app-root')).toBeVisible();
      await dismissWizard(onda.page);
      await onda.page.evaluate(() => {
        window.location.hash = '#/online';
      });

      const input = onda.page.getByTestId('online-search-input');
      await expect(input).toBeVisible();
      await input.fill('onda e2e');
      await input.press('Enter');

      const cards = onda.page.getByTestId('online-media-card');
      await expect(cards).toHaveCount(3);
      await expect(cards.first()).toContainText('E2E Result 1');

      await onda.page.evaluate(async () => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.invoke('yt:download:add', [
          {
            url: 'https://www.youtube.com/watch?v=e2e-1',
            title: 'E2E Download 1',
            kind: 'audio',
            format: 'best',
            quality: 'best',
            outputDir: '.',
            filenameTemplate: '%(title)s.%(ext)s'
          }
        ]);
      });

      await onda.page.evaluate(() => {
        window.location.hash = '#/downloads';
      });
      const row = onda.page.getByTestId('download-row').first();
      await expect(row).toBeVisible();
      await expect(row).toContainText('E2E Download 1');

      // The fixture queue advances to completed through real progress broadcasts.
      await expect
        .poll(
          () =>
            onda.page.evaluate(async () => {
              const api = (window as unknown as { api: OndaTestApi }).api;
              const list = (await api.invoke('yt:download:list')) as Array<{ status?: string }>;
              return list[0]?.status ?? 'missing';
            }),
          { timeout: 10_000 }
        )
        .toBe('completed');

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
