import { test, expect } from '@playwright/test';
import { mkdtempSync, copyFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { dismissWizard, launchOnda } from './helpers/app';

interface MediaApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

// Faza 5: wideo w trybie Core-shell. Audio należy do Core, ale obraz i <video>
// grają lokalnie w main shellu. Sample to 2 s VP9 bez ścieżki audio.
test('video plays locally in the core-shell main window', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'onda-video-'));
  const videoPath = join(dir, 'sample.webm');
  copyFileSync(resolve(__dirname, 'fixtures', 'sample.webm'), videoPath);
  const onda = await launchOnda({ env: { ONDA_CORE_SHELL: '1' } });

  try {
    const page = onda.page;
    await dismissWizard(page);

    const scanned = await page.evaluate(
      async ({ folder, file }) => {
        const api = (window as unknown as { api: MediaApi }).api;
        await api.invoke('library:saveFolders', [folder]);
        const result = (await api.invoke('library:scan', [folder])) as
          { count?: number } | undefined;
        await api.grantMediaAccess(file);
        return result?.count ?? 0;
      },
      { folder: dir, file: videoPath }
    );
    expect(scanned).toBeGreaterThan(0);

    await page.reload();
    await dismissWizard(page);
    await page.evaluate(() => {
      window.location.hash = '#/library';
    });
    await page.getByTestId('library-tab-video').click();
    const card = page.getByTestId('video-card').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();

    await page.evaluate(() => {
      window.location.hash = '#/player';
    });
    await expect(page.getByTestId('player-view')).toBeVisible({ timeout: 15_000 });

    // Zapętl sample w samym <video>, żeby 2-sekundowy fixture nie skończył się
    // przed asercją stanu odtwarzania.
    await page.evaluate(() => {
      const video = document.querySelector('video');
      if (video) video.loop = true;
    });

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const video = document.querySelector('video') as HTMLVideoElement | null;
            if (!video) return null;
            return {
              paused: video.paused,
              readyState: video.readyState,
              width: video.videoWidth,
              height: video.videoHeight
            };
          }),
        { timeout: 10_000 }
      )
      .toMatchObject({ paused: false, width: 160, height: 120 });

    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
});
