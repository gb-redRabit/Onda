import { test, expect } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Odłączone okno eksploratora: "Open in window" tworzy prawdziwe drugie BrowserWindow,
// które renderuje eksplorator na bieżącej ścieżce i można je zamknąć.

test.describe('explorer detached window', () => {
  test('opens a second explorer window and closes it', async () => {
    const onda = await launchOnda();
    const { page, app } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/explorer';
      });
      await expect(page.getByTestId('explorer-view')).toBeVisible();
      // Poczekaj, aż eksplorator będzie miał zawartość (bieżącą ścieżkę), zanim go odłączysz.
      await expect
        .poll(() => page.locator('[data-testid^="explorer-item-"]').count(), { timeout: 15_000 })
        .toBeGreaterThan(0);

      const windowPromise = app.waitForEvent('window');
      await page.getByTestId('explorer-open-window').click();
      const detached = await windowPromise;

      await expect(detached.getByTestId('explorer-window-root')).toBeVisible();
      await expect(detached.locator('main[data-route]')).toHaveAttribute(
        'data-route',
        'explorer-window'
      );
      await expect(detached.getByTestId('explorer-view')).toBeVisible();
      await expect
        .poll(() => detached.locator('[data-testid^="explorer-item-"]').count(), {
          timeout: 15_000
        })
        .toBeGreaterThan(0);

      // Zamknij je z wnętrza odłączonego okna.
      const closed = detached.waitForEvent('close');
      await detached.evaluate(() => {
        const api = (window as unknown as { api?: { invoke: (c: string) => Promise<unknown> } }).api;
        return api?.invoke('window:close');
      });
      await closed;

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
