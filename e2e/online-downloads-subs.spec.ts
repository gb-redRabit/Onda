import { test, expect } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Pobierania z obu platform (przez deterministyczne fixture'y kolejki e2e) i
// przepływ subskrypcji (lokalny magazyn — bez sieci).

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

test.describe('online downloads and subscriptions', () => {
  test('queues YouTube/SoundCloud downloads and manages subscriptions', async () => {
    const onda = await launchOnda({ env: { ONDA_E2E_FIXTURES: '1' } });
    const { page } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/online';
      });

      // Pole wyszukiwania wykrywa platformę wklejonego linku.
      const input = page.getByTestId('online-search-input');
      await expect(input).toBeVisible();
      await input.fill('https://soundcloud.com/e2e/track');
      await expect(page.getByTestId('online-detect-badge')).toHaveText('SC');
      await input.fill('https://www.youtube.com/watch?v=e2e');
      await expect(page.getByTestId('online-detect-badge')).toHaveText('YT');
      await input.fill('');

      // Zakolejkuj jedno zadanie YouTube i jedno SoundCloud (fixture'y odzwierciedlają cykl życia).
      await page.evaluate(async () => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.invoke('yt:download:add', [
          {
            url: 'https://www.youtube.com/watch?v=e2e-yt',
            title: 'E2E YouTube',
            kind: 'audio',
            format: 'best',
            quality: 'best',
            outputDir: '.',
            filenameTemplate: '%(title)s.%(ext)s'
          },
          {
            url: 'https://soundcloud.com/e2e/track',
            title: 'E2E SoundCloud',
            kind: 'audio',
            format: 'best',
            quality: 'best',
            outputDir: '.',
            filenameTemplate: '%(title)s.%(ext)s'
          }
        ]);
      });

      await page.evaluate(() => {
        window.location.hash = '#/downloads';
      });
      const rows = page.getByTestId('download-row');
      await expect(rows).toHaveCount(2);
      await expect(rows.first()).toContainText('E2E YouTube');
      await expect(rows.nth(1)).toContainText('E2E SoundCloud');

      // Subskrypcje: dodaj lokalnie, utrzymuje się po przeładowaniu, następnie przestań obserwować.
      await page.evaluate(async () => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.invoke('yt:subs:add', {
          channelId: 'UCe2echannel00000000000001',
          channelTitle: 'E2E Sub Channel',
          channelThumbnail: ''
        });
      });
      await page.waitForTimeout(600);
      await page.reload();
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/online';
      });
      await page.getByTestId('online-tab-subscriptions').click();

      const card = page.getByTestId('online-subscription-card');
      await expect(card).toHaveCount(1, { timeout: 15_000 });
      await expect(card).toContainText('E2E Sub Channel');

      // Odobserwowanie z menu karty i cofnięcie z toastu przywraca ten sam wpis.
      await card.getByTestId('subscription-actions').click();
      await page.getByRole('menuitem', { name: /usuń subskrypcję/i }).click();
      await page.getByRole('button', { name: /^usuń$/i }).click();
      await expect(card).toHaveCount(0);
      const undoToast = page.getByTestId('toast').filter({ hasText: /odobserwowano/i });
      await expect(undoToast).toBeVisible();
      await undoToast.getByRole('button', { name: /cofnij/i }).click();
      await expect(card).toHaveCount(1, { timeout: 15_000 });

      await page.evaluate(async (id) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.invoke('yt:subs:remove', id);
      }, 'UCe2echannel00000000000001');
      await page.waitForTimeout(600);
      await page.reload();
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/online';
      });
      await page.getByTestId('online-tab-subscriptions').click();
      await expect(page.getByTestId('online-subscription-card')).toHaveCount(0, {
        timeout: 15_000
      });

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
