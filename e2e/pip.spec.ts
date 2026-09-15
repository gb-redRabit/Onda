import { test, expect } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

interface OndaTestApi {
  audioPipShow: (
    state: Record<string, unknown>,
    opts?: Record<string, unknown>
  ) => Promise<boolean>;
  audioPipHide: () => Promise<boolean>;
}

const PIP_PAGE = 'audio-pip.html';

test.describe('audio PiP', () => {
  test('shows the floating window with the track state and hides it again', async () => {
    const onda = await launchOnda();
    try {
      await expect(onda.page.getByTestId('app-root')).toBeVisible();
      await dismissWizard(onda.page);

      // The window is prewarmed hidden; assert real visibility of the BrowserWindow.
      const pipWindowVisible = (): Promise<boolean> =>
        onda.app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some(
            (win) =>
              !win.isDestroyed() &&
              win.isVisible() &&
              win.webContents.getURL().includes('audio-pip.html')
          )
        );

      await expect.poll(pipWindowVisible).toBe(false);

      await onda.page.evaluate(() => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        return api.audioPipShow(
          {
            trackName: 'E2E Track',
            artist: 'E2E Artist',
            isPlaying: false,
            currentTime: 0,
            duration: 1
          },
          { dock: 'bottom-right', cornerElements: ['cover', 'trackInfo'], autoHide: false }
        );
      });

      await expect.poll(pipWindowVisible, { timeout: 10_000 }).toBe(true);

      const pipPage = onda.app.windows().find((page) => page.url().includes(PIP_PAGE));
      expect(pipPage).toBeTruthy();
      await expect(pipPage!.locator('body')).toContainText('E2E Track');

      await onda.page.evaluate(() => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        return api.audioPipHide();
      });

      await expect.poll(pipWindowVisible, { timeout: 10_000 }).toBe(false);
      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
