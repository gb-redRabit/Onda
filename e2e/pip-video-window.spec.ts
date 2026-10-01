import { test, expect } from '@playwright/test';
import { resolve } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';

// Okno PiP wideo: jest pozycjonowane i zmieniane rozmiarowo na podstawie żądanej pozycji, a jego
// własne kontrolki (panel ustawień, napisy, zamknięcie) działają.

const FIXTURE = resolve(__dirname, 'fixtures', 'sample.webm');

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
  pipStart: (
    src: string,
    settings?: { position?: string; width?: number; height?: number }
  ) => Promise<boolean>;
}

test.describe('video PiP window', () => {
  test('is placed per position/size and its controls work', async () => {
    const onda = await launchOnda();
    const { page, app } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(async (p) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.grantMediaAccess(p);
      }, FIXTURE);
      const work = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);

      const startPip = (position: string, width: number, height: number) =>
        page.evaluate(
          async (args) => {
            const api = (window as unknown as { api: OndaTestApi }).api;
            const src = `${(window as unknown as { api: { mediaServerUrl: string } }).api.mediaServerUrl}?path=${encodeURIComponent(args.path)}`;
            await api.pipStart(src, {
              position: args.position,
              width: args.width,
              height: args.height
            });
          },
          { path: FIXTURE, position, width, height }
        );

      const findPip = () =>
        app.evaluate(({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows().find(
            (x) =>
              !x.isDestroyed() &&
              x.webContents.getURL().includes('/pip.html') &&
              !x.webContents.getURL().includes('preview')
          );
          return w ? w.getBounds() : null;
        });

      // Lewy górny róg, mały.
      await startPip('top-left', 320, 180);
      await expect.poll(() => findPip()).not.toBeNull();
      const small = (await findPip())!;
      expect(small.width).toBeGreaterThan(100);
      expect(small.height).toBeGreaterThan(100);
      expect(Math.abs(small.x - (work.x + 20))).toBeLessThanOrEqual(2);
      expect(Math.abs(small.y - (work.y + 20))).toBeLessThanOrEqual(2);

      // Większy, prawy dolny róg: rozmiar podąża za żądaniem, a okno się przesuwa.
      await startPip('bottom-right', 420, 260);
      await expect.poll(async () => (await findPip())!.width).toBeGreaterThan(small.width);
      const big = (await findPip())!;
      expect(big.height).toBeGreaterThan(small.height);
      expect(big.x).toBeGreaterThan(small.x);
      expect(big.y).toBeGreaterThan(small.y);

      const pip = app
        .windows()
        .find((p) => p.url().includes('/pip.html') && !p.url().includes('preview'))!;

      // Panel ustawień otwiera się, napisy przełączają się, panel się zamyka.
      await pip.getByTestId('pip-video-settings').click();
      await expect(pip.getByTestId('pip-video-settings-panel')).toBeVisible();
      await pip.getByTestId('pip-video-subs').click();
      await pip.getByTestId('pip-video-settings').click();
      await expect(pip.getByTestId('pip-video-settings-panel')).toHaveCount(0);

      // Zamknięcie ukrywa okno (pozostaje żywe do ponownego użycia).
      await pip.getByTestId('pip-video-close').click();
      await expect
        .poll(() =>
          app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().some(
              (w) => w.webContents.getURL().includes('/pip.html') && w.isVisible()
            )
          )
        )
        .toBe(false);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
