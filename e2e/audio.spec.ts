import { test, expect } from '@playwright/test';
import { rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';
import { createMediaFixture } from './helpers/media';

// Audio: wygenerowany plik WAV jest skanowany, odtwarzany przez pasek odtwarzacza, a
// widok Audio eksponuje swój HUD (kontrolki wizualizacji/ustawień/układu).

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

test.describe('audio playback and audio view', () => {
  const media = createMediaFixture();
  writeFileSync(
    join(media.dir, 'tone.srt'),
    [
      '1',
      '00:00:00,000 --> 00:00:00,400',
      'First line',
      '',
      '2',
      '00:00:00,400 --> 00:00:00,700',
      'Second line',
      '',
      '3',
      '00:00:00,700 --> 00:00:00,950',
      'Third line'
    ].join('\n')
  );

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
      await expect(page.locator('[data-testid="player-bar"][data-playing="true"]')).toBeVisible({
        timeout: 20_000
      });

      // Kontrolki paska odtwarzacza istnieją i przełączają się bez błędów.
      await expect(page.getByTestId('player-eq')).toBeVisible();
      await expect(page.getByTestId('player-queue')).toBeVisible();
      await page.getByTestId('player-queue').click();
      await page.getByTestId('player-eq').click();
      // Zamknij kolejkę: w układzie narrow panel kolejki jest nakładką i zasłoniłby HUD widoku Audio.
      await page.getByTestId('player-queue').click();
      await expect(page.getByTestId('queue-panel')).toHaveCount(0);

      // Widok Audio: kontrolki HUD renderują się, gdy utwór jest załadowany, pusty stan znika.
      await page.evaluate(() => {
        window.location.hash = '#/audio';
      });
      await expect(page.locator('main[data-route]')).toHaveAttribute('data-route', 'audio');
      await expect(page.getByTestId('audio-view')).toBeVisible();
      await expect(page.getByTestId('audio-empty')).toHaveCount(0);
      await expect(page.getByTestId('audio-cycle-viz')).toBeVisible();
      // Warstwa fali jest renderowana w elemencie postępu (piki dochodzą asynchronicznie
      // z FFmpeg; sam canvas musi istnieć nawet w profilu bez FFmpeg).
      await expect(page.getByTestId('audio-waveform')).toBeVisible();

      // Tekst piosenki jest elementem układu audio; sidecar .srt czyta IPC.
      await expect(page.getByTestId('lyrics-panel')).toBeVisible();
      const progress = page.locator('[role="slider"]').first();
      await progress.focus();
      await page.keyboard.press('Home');

      // Widoczne są tylko dwie linie: bieżąca i następna; po przewinięciu następna
      // staje się bieżącą, a lista nie przewija się w dół.
      const current = page.getByTestId('lyrics-current');
      const next = page.getByTestId('lyrics-next');
      await expect(current).toHaveText('First line');
      await expect(next).toHaveText('Second line');
      await next.click();
      await expect(current).toHaveText('Second line');
      await expect(next).toHaveText('Third line');
      await next.click();
      await expect(current).toHaveText('Third line');
      await expect(next).toHaveCount(0);

      await page.getByTestId('audio-cycle-viz').click();
      await page.getByTestId('audio-viz-settings').click();
      await page.getByTestId('audio-layout-editor').click();

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
