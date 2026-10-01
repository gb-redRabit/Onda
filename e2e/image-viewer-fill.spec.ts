import { test, expect, type ElectronApplication } from '@playwright/test';
import { rmSync } from 'fs';
import { basename } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';
import { createImageFixture } from './helpers/media';

// Przeglądarka obrazów to pełnoekranowy lightbox: jej nakładka musi wypełniać okno
// (pełny ekran i okno), z obrazem i paskiem miniatur w granicach.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
  getWindowId: () => Promise<number>;
}

const COUNT = 3;

test.describe('image viewer fills the window', () => {
  const fixture = createImageFixture(COUNT);

  test.afterAll(() => {
    rmSync(fixture.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  async function setBounds(app: ElectronApplication, winId: number, bounds: Bounds) {
    await app.evaluate(
      ({ BrowserWindow }, args) => BrowserWindow.fromId(args.id)?.setBounds(args.bounds),
      { id: winId, bounds }
    );
  }

  test('overlay covers the window in fullscreen and windowed', async () => {
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
        (items) => {
          const api = (window as unknown as { api: OndaTestApi }).api;
          return api.invoke('imageViewer:open', items, 0);
        },
        files
      );
      const viewer = await windowPromise;
      await expect(viewer.getByTestId('image-viewer')).toBeVisible();

      const measure = () =>
        viewer.evaluate(() => {
          const el = document.querySelector('[data-testid="image-viewer"]') as HTMLElement;
          const r = el.getBoundingClientRect();
          const img = document
            .querySelector('[data-testid="image-viewer-image"]')!
            .getBoundingClientRect();
          const strip = document.querySelector('[data-testid="image-viewer-strip"]');
          return {
            overlayW: r.width,
            overlayH: r.height,
            iw: window.innerWidth,
            ih: window.innerHeight,
            imgLeft: img.left,
            imgRight: img.right,
            stripRight: strip ? strip.getBoundingClientRect().right : 0
          };
        });

      // Pełny ekran: nakładka == okno.
      await expect
        .poll(async () => {
          const v = await measure();
          return Math.abs(v.overlayW - v.iw);
        })
        .toBeLessThanOrEqual(2);
      let m = await measure();
      expect(Math.abs(m.overlayH - m.ih)).toBeLessThanOrEqual(2);
      expect(m.imgLeft).toBeGreaterThanOrEqual(-1);
      expect(m.imgRight).toBeLessThanOrEqual(m.iw + 1);
      expect(m.stripRight).toBeLessThanOrEqual(m.iw + 1);

      // Wyjdź z pełnego ekranu i zmień rozmiar: nakładka nadal wypełnia okno.
      await viewer.getByTestId('image-viewer-fullscreen').click();
      await viewer.waitForTimeout(500);
      const winId = await viewer.evaluate(() =>
        (window as unknown as { api: OndaTestApi }).api.getWindowId()
      );
      await setBounds(app, winId, { x: 0, y: 0, width: 1000, height: 700 });
      await viewer.waitForTimeout(300);

      await expect.poll(async () => (await measure()).iw).toBeGreaterThanOrEqual(900);
      m = await measure();
      expect(Math.abs(m.overlayW - m.iw)).toBeLessThanOrEqual(2);
      expect(Math.abs(m.overlayH - m.ih)).toBeLessThanOrEqual(2);
      expect(m.imgRight).toBeLessThanOrEqual(m.iw + 1);
      expect(m.stripRight).toBeLessThanOrEqual(m.iw + 1);

      const closed = viewer.waitForEvent('close');
      await viewer.getByTestId('image-viewer-close').click();
      await closed;

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
