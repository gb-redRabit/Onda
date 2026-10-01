import { test, expect, type ElectronApplication } from '@playwright/test';
import { resolve } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';

// Real video PiP: the fixture is a tiny VP9/WebM generated with the managed
// ffmpeg (e2e/fixtures/sample.webm) — no network, no H.264 dependency.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

const FIXTURE_DIR = resolve(__dirname, 'fixtures');
const FIXTURE_FILE = resolve(FIXTURE_DIR, 'sample.webm');

async function isVideoPipVisible(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some(
      (w) => /\/pip\.html/.test(w.webContents.getURL()) && w.isVisible()
    )
  );
}

test.describe('video PiP', () => {
  test('plays a real video, opens the PiP window and restores it from the menu', async () => {
    const onda = await launchOnda();
    const { page, app } = onda;
    try {
      await dismissWizard(page);

      // Seed the library with the generated video and rescan.
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
      await expect(page.locator('main[data-route]')).toHaveAttribute('data-route', 'library');

      await page.getByTestId('library-tab-video').click();
      const card = page.getByTestId('video-card').first();
      await expect(card).toBeVisible({ timeout: 15_000 });

      // Playing a video auto-navigates to the player route.
      await card.click();
      await expect(page.locator('main[data-route]')).toHaveAttribute('data-route', 'player');
      await expect(page.getByTestId('player-view')).toBeVisible();
      await expect(page.getByTestId('player-view').locator('video').first()).toBeVisible();

      // Start PiP from the player top bar. The PiP window is created hidden at
      // boot (pipManager.init), so showing it emits no "new window" event.
      await page.getByTestId('player-pip').click();
      await expect.poll(() => isVideoPipVisible(app), { timeout: 15_000 }).toBe(true);
      const pip = app.windows().find((w) => /\/pip\.html/.test(w.url()));
      expect(pip).toBeTruthy();
      await expect(pip!.locator('video').first()).toBeVisible();

      // The Playback menu now offers "return PiP to player".
      await page.locator('[data-menu-trigger="playback"]').click();
      const returnItem = page.getByTestId('menu-return-pip');
      await expect(returnItem).toBeVisible();
      await returnItem.click();

      // The PiP window hides again and the player keeps the video.
      await expect.poll(() => isVideoPipVisible(app), { timeout: 15_000 }).toBe(false);
      await expect(page.getByTestId('player-view')).toBeVisible();

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
