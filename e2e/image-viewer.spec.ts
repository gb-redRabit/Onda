import { test, expect } from '@playwright/test';
import { rmSync } from 'fs';
import { basename } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';
import { createImageFixture } from './helpers/media';

// Image viewer stress test: 55 real PNGs. Verifies the thumbnail strip renders
// (windowed around the active index), the active thumbnail is highlighted,
// centred and scrolled into view, plus navigation, zoom/rotate/fit, slideshow
// and the thumbnails toggle.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

const COUNT = 55;

test.describe('image viewer', () => {
  const fixture = createImageFixture(COUNT);

  test.afterAll(() => {
    rmSync(fixture.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  function fileItems() {
    return fixture.files.map((path) => ({
      name: basename(path),
      path,
      isDirectory: false,
      size: 1,
      modifiedAt: 0,
      createdAt: 0,
      extension: 'png',
      mimeType: 'image/png'
    }));
  }

  test('renders many thumbnails, centres the active one and supports the controls', async () => {
    const onda = await launchOnda();
    const { page, app } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(async (first) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.grantMediaAccess(first);
      }, fixture.files[0]);

      const midIndex = 40;
      const windowPromise = app.waitForEvent('window');
      await page.evaluate(
        async ({ files, index }) => {
          const api = (window as unknown as { api: OndaTestApi }).api;
          await api.invoke('imageViewer:open', files, index);
        },
        { files: fileItems(), index: midIndex }
      );
      const viewer = await windowPromise;

      await expect(viewer.locator('main[data-route]')).toHaveAttribute(
        'data-route',
        'image-viewer'
      );
      await expect(viewer.getByTestId('image-viewer')).toBeVisible();
      await expect(viewer.getByTestId('image-viewer-counter')).toHaveText(
        `${midIndex + 1} / ${COUNT}`
      );
      await expect(viewer.getByTestId('image-viewer-image')).toBeVisible({ timeout: 20_000 });

      // Thumbnails are windowed around the active index (not all 55 at once).
      const thumbCount = await viewer.locator('[data-thumb-idx]').count();
      expect(thumbCount).toBeGreaterThan(30);
      expect(thumbCount).toBeLessThan(COUNT);

      // The active thumbnail is highlighted.
      const active = viewer.locator(`[data-thumb-idx="${midIndex}"]`);
      await expect(active).toHaveClass(/border-primary/);

      // The strip auto-scrolls so the active thumbnail is centred and in view.
      const strip = viewer.getByTestId('image-viewer-strip');
      await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      const placement = await viewer.evaluate((idx) => {
        const s = document.querySelector('[data-testid="image-viewer-strip"]') as HTMLElement;
        const a = document.querySelector(`[data-thumb-idx="${idx}"]`) as HTMLElement;
        if (!s || !a) return { inView: false, delta: 9999 };
        const sr = s.getBoundingClientRect();
        const ar = a.getBoundingClientRect();
        return {
          inView: ar.left >= sr.left - 1 && ar.right <= sr.right + 1,
          delta: Math.abs(ar.left + ar.width / 2 - (sr.left + sr.width / 2))
        };
      }, midIndex);
      expect(placement.inView).toBe(true);
      expect(placement.delta).toBeLessThan(80);

      // Next / previous move the active index and its highlight. Each navigation
      // starts a ~500ms transition that intentionally blocks the next one, so we
      // let it settle between steps.
      const settle = () => viewer.waitForTimeout(650);
      await viewer.getByTestId('image-viewer-next').click();
      await expect(viewer.getByTestId('image-viewer-counter')).toHaveText(
        `${midIndex + 2} / ${COUNT}`
      );
      await expect(viewer.locator(`[data-thumb-idx="${midIndex + 1}"]`)).toHaveClass(
        /border-primary/
      );
      await settle();
      await viewer.getByTestId('image-viewer-prev').click();
      await expect(viewer.getByTestId('image-viewer-counter')).toHaveText(
        `${midIndex + 1} / ${COUNT}`
      );
      await settle();
      // Keyboard handler (ArrowRight) advances again.
      await viewer.evaluate(() =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
      );
      await expect(viewer.getByTestId('image-viewer-counter')).toHaveText(
        `${midIndex + 2} / ${COUNT}`
      );
      await settle();

      // Clicking a rendered thumbnail jumps to it (the strip is windowed).
      await viewer.locator('[data-thumb-idx="20"]').click();
      await expect(viewer.getByTestId('image-viewer-counter')).toHaveText(`21 / ${COUNT}`);

      // Zoom / rotate / fit readouts.
      await viewer.getByTestId('image-viewer-zoom-in').click();
      await expect(viewer.getByTestId('image-viewer-scale')).toBeVisible();
      await viewer.getByTestId('image-viewer-rotate').click();
      await expect(viewer.getByTestId('image-viewer-rotation')).toHaveText('90°');
      await viewer.getByTestId('image-viewer-fit').click();
      await expect(viewer.getByTestId('image-viewer-scale')).toHaveCount(0);

      // Slideshow toggles and exposes the progress bar.
      await viewer.getByTestId('image-viewer-slideshow').click();
      await expect(viewer.getByTestId('image-viewer-slideshow-progress')).toBeVisible();
      await viewer.getByTestId('image-viewer-slideshow').click();
      await expect(viewer.getByTestId('image-viewer-slideshow-progress')).toHaveCount(0);

      // Thumbnails toggle collapses and re-opens the strip.
      await viewer.getByTestId('image-viewer-thumbnails-toggle').click();
      await expect(strip).toHaveClass(/h-0/);
      await viewer.getByTestId('image-viewer-thumbnails-toggle').click();
      await expect(strip).toHaveClass(/h-20/);

      // Close from the toolbar.
      await viewer.getByTestId('image-viewer-close').click();
      await expect.poll(() => viewer.isClosed()).toBe(true);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
