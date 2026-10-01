import { test, expect } from '@playwright/test';
import { rmSync } from 'fs';
import { launchOnda, dismissWizard } from './helpers/app';
import { createMediaFixture } from './helpers/media';

// Audio: a generated WAV is scanned, played through the player bar, and the
// Audio view exposes its HUD (visualization/settings/layout controls).

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

test.describe('audio playback and audio view', () => {
  const media = createMediaFixture();

  test.afterAll(() => {
    rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('plays a WAV, shows the player bar and the audio HUD', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);

      const scanned = await page.evaluate(async (dir) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.invoke('library:saveFolders', [dir]);
        const result = (await api.invoke('library:scan', [dir])) as { count?: number } | undefined;
        return result?.count ?? 0;
      }, media.dir);
      expect(scanned).toBeGreaterThan(0);
      await page.waitForTimeout(1000);
      await page.reload();
      await dismissWizard(page);
      await page.evaluate(async (path) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.grantMediaAccess(path);
      }, media.wavPath);

      await page.evaluate(() => {
        window.location.hash = '#/library';
      });
      await page.getByTestId('library-tab-tracks').click();
      await expect(page.getByTestId('library-track').first()).toBeVisible();
      await page.getByTestId('library-track-play').first().click();
      await expect(
        page.locator('[data-testid="player-bar"][data-playing="true"]')
      ).toBeVisible({ timeout: 20_000 });

      // Player-bar controls exist and toggle without errors.
      await expect(page.getByTestId('player-eq')).toBeVisible();
      await expect(page.getByTestId('player-queue')).toBeVisible();
      await page.getByTestId('player-queue').click();
      await page.getByTestId('player-eq').click();

      // Audio view: HUD controls render while a track is loaded, empty state gone.
      await page.evaluate(() => {
        window.location.hash = '#/audio';
      });
      await expect(page.locator('main[data-route]')).toHaveAttribute('data-route', 'audio');
      await expect(page.getByTestId('audio-view')).toBeVisible();
      await expect(page.getByTestId('audio-empty')).toHaveCount(0);
      await expect(page.getByTestId('audio-cycle-viz')).toBeVisible();
      await page.getByTestId('audio-cycle-viz').click();
      await page.getByTestId('audio-viz-settings').click();
      await page.getByTestId('audio-layout-editor').click();

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
