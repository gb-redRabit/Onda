import { test, expect } from '@playwright/test';
import { rmSync } from 'fs';
import { basename } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';
import { createImageFixture } from './helpers/media';

// Image viewer slideshow settings: interval, transition type, duration and the
// loop / shuffle / ken-burns / auto-hide switches.

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

      // Open the settings panel.
      await viewer.getByTestId('image-viewer-slideshow-settings').click();
      const panel = viewer.getByTestId('image-viewer-settings');
      await expect(panel).toBeVisible();

      // Interval: selecting one marks it primary, the others are not.
      await viewer.getByTestId('iv-interval-1000').click();
      await expect(viewer.getByTestId('iv-interval-1000')).toHaveClass(/bg-primary/);
      await expect(viewer.getByTestId('iv-interval-3000')).not.toHaveClass(/bg-primary/);

      // Transition type.
      await viewer.getByTestId('iv-transition-slide').click();
      await expect(viewer.getByTestId('iv-transition-slide')).toHaveClass(/bg-primary/);
      await expect(viewer.getByTestId('iv-transition-fade')).not.toHaveClass(/bg-primary/);

      // Transition duration.
      await viewer.getByTestId('iv-duration-800').click();
      await expect(viewer.getByTestId('iv-duration-800')).toHaveClass(/bg-primary/);

      // Switches flip their state.
      for (const id of ['iv-loop', 'iv-shuffle', 'iv-ken-burns', 'iv-auto-hide']) {
        const toggle = viewer.getByTestId(id);
        const before = await toggle.evaluate((el) => el.className.includes('bg-primary'));
        await toggle.click();
        await expect
          .poll(() => toggle.evaluate((el) => el.className.includes('bg-primary')))
          .toBe(!before);
      }

      // Escape closes the settings panel (the click-outside overlay covers the
      // gear button, so the keyboard path is the deterministic one).
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
