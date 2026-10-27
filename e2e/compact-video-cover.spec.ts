import { test, expect } from '@playwright/test';
import { copyFileSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { launchOnda } from './helpers/app';
import { createMediaFixture } from './helpers/media';

interface CompactApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

// Compact odtwarza tylko audio, ale okładką audio może być towarzyszący plik
// wideo (np. teledysk obok MP3/WAV). Sprawdzamy, że taka okładka renderuje się
// jako <video> i nie trafia do listy jako osobny utwór.
test('compact plays audio with a video cover', async () => {
  const media = createMediaFixture(6);
  const videoCover = join(media.dir, 'tone.webm');
  copyFileSync(resolve(__dirname, 'fixtures', 'sample.webm'), videoCover);

  const onda = await launchOnda({
    windowFile: 'compact.html',
    profileSetup: (dir) => {
      writeFileSync(join(dir, 'compact-window-state.json'), JSON.stringify({ mode: 'compact' }));
    }
  });

  try {
    const page = onda.page;
    await expect(page.getByTestId('compact-root')).toBeVisible({ timeout: 20_000 });

    const scanned = await page.evaluate(
      async ({ dir, audio }) => {
        const api = (window as unknown as { api: CompactApi }).api;
        await api.invoke('library:saveFolders', [dir]);
        const result = (await api.invoke('library:scan', [dir])) as { count?: number } | undefined;
        await api.grantMediaAccess(audio);
        return result?.count ?? 0;
      },
      { dir: media.dir, audio: media.wavPath }
    );
    expect(scanned).toBeGreaterThan(0);

    await page.reload();
    await expect(page.getByTestId('compact-track-0')).toBeVisible({ timeout: 20_000 });
    // Wideo nie jest osobnym utworem w compactcie — liczy się jako okładka audio.
    await expect(page.getByTestId('compact-track-1')).toHaveCount(0);

    await page.getByTestId('compact-track-0').click();
    await expect(page.getByTestId('compact-title')).toContainText('tone', { timeout: 10_000 });

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const video = document.querySelector(
              '[data-testid="compact-cover"] video'
            ) as HTMLVideoElement | null;
            if (!video) return null;
            return {
              src: video.getAttribute('src') ?? '',
              paused: video.paused,
              width: video.videoWidth
            };
          }),
        { timeout: 15_000 }
      )
      .toMatchObject({ paused: false, width: 160 });

    const cover = await page.evaluate(() => {
      const video = document.querySelector(
        '[data-testid="compact-cover"] video'
      ) as HTMLVideoElement | null;
      return video ? { src: video.getAttribute('src') ?? '' } : null;
    });
    expect(cover?.src).toContain('tone.webm');

    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
    rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
});
