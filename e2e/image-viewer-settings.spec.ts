import { test, expect } from '@playwright/test';
import { rmSync } from 'fs';
import { basename } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';
import { createImageFixture } from './helpers/media';

// Ustawienia pokazu slajdów przeglądarki obrazów: interwał, typ przejścia, czas trwania oraz
// przełączniki loop / shuffle / ken-burns / auto-hide.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

test.describe('image viewer settings', () => {
  const fixture = createImageFixture(4);

  test.afterAll(() => {
    rmSync(fixture.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('exposes and toggles every slideshow option', async () => {
    const onda = await launchOnda();
    const { page, app } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(async (first) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.grantMediaAccess(first);
      }, fixture.files[0]);

      const files = fixture.files.map((path) => ({
        name: basename(path),
        path,
        isDirectory: false,
        size: 1,
        modifiedAt: 0,
        createdAt: 0,
        extension: 'png',
        mimeType: 'image/png'
      }));
      const windowPromise = app.waitForEvent('window');
      await page.evaluate(
        async (items) => {
          const api = (window as unknown as { api: OndaTestApi }).api;
          await api.invoke('imageViewer:open', items, 0);
        },
        files
      );
      const viewer = await windowPromise;
      await expect(viewer.getByTestId('image-viewer')).toBeVisible();

      // Otwórz panel ustawień.
      await viewer.getByTestId('image-viewer-slideshow-settings').click();
      const panel = viewer.getByTestId('image-viewer-settings');
      await expect(panel).toBeVisible();

      // Interwał: zaznaczenie jednego oznacza go jako primary, pozostałe nie.
      await viewer.getByTestId('iv-interval-1000').click();
      await expect(viewer.getByTestId('iv-interval-1000')).toHaveClass(/bg-primary/);
      await expect(viewer.getByTestId('iv-interval-3000')).not.toHaveClass(/bg-primary/);

      // Typ przejścia.
      await viewer.getByTestId('iv-transition-slide').click();
      await expect(viewer.getByTestId('iv-transition-slide')).toHaveClass(/bg-primary/);
      await expect(viewer.getByTestId('iv-transition-fade')).not.toHaveClass(/bg-primary/);

      // Czas trwania przejścia.
      await viewer.getByTestId('iv-duration-800').click();
      await expect(viewer.getByTestId('iv-duration-800')).toHaveClass(/bg-primary/);

      // Przełączniki zmieniają swój stan.
      for (const id of ['iv-loop', 'iv-shuffle', 'iv-ken-burns', 'iv-auto-hide']) {
        const toggle = viewer.getByTestId(id);
        const before = await toggle.evaluate((el) => el.className.includes('bg-primary'));
        await toggle.click();
        await expect
          .poll(() => toggle.evaluate((el) => el.className.includes('bg-primary')))
          .toBe(!before);
      }

      // Escape zamyka panel ustawień (nakładka click-outside pokrywa
      // przycisk koła zębatego, więc ścieżka klawiaturowa jest deterministyczna).
      await viewer.evaluate(() =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      );
      await expect(panel).toHaveCount(0);

      await viewer.getByTestId('image-viewer-close').click();
      await expect.poll(() => viewer.isClosed()).toBe(true);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
