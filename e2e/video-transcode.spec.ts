import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { launchOnda, dismissWizard } from './helpers/app';
import { findFfmpegTools, seedFfmpegProfile } from './helpers/ffmpeg';

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

// Regresja transkodowania: AVI z MPEG-4 Part 2 (DivX/Xvid) i AC3 nie jest
// odtwarzalny przez Chromium. Zarządzany FFmpeg jest buildem LGPL bez libx264,
// więc fallback musi użyć OpenH264/Media Foundation, a użytkownik ma widzieć
// nakładkę postępu w obszarze wideo (bez dodatkowego toastu).
test('transcodes an unsupported AVI and shows the in-player progress overlay', async () => {
  test.slow();
  const tools = findFfmpegTools();
  test.skip(!tools, 'FFmpeg not available in the E2E profile');

  const dir = mkdtempSync(join(tmpdir(), 'onda-avi-'));
  const avi = join(dir, 'clip.avi');
  execFileSync(tools!.ffmpeg, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=160x120:rate=10',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-t',
    '20',
    '-c:v',
    'mpeg4',
    '-c:a',
    'ac3',
    '-y',
    avi
  ]);

  const onda = await launchOnda({
    profileSetup: (profileDir) => seedFfmpegProfile(profileDir, tools!)
  });
  try {
    await dismissWizard(onda.page);
    const scanned = await onda.page.evaluate(async (folder) => {
      const api = (window as unknown as { api: OndaTestApi }).api;
      await api.invoke('library:saveFolders', [folder]);
      const result = (await api.invoke('library:scan', [folder])) as { count?: number } | undefined;
      return result?.count ?? 0;
    }, dir);
    expect(scanned).toBeGreaterThan(0);

    // Skan zapisuje się z debounce; po reloadzie biblioteka musi znać plik.
    await onda.page.waitForTimeout(1000);
    await onda.page.evaluate(() => localStorage.setItem('onda.libraryTab', 'video'));
    await onda.page.reload();
    await dismissWizard(onda.page);
    await onda.page.evaluate(() => {
      window.location.hash = '#/library';
    });

    await onda.page.getByTestId('video-card').first().click();

    const overlay = onda.page.getByTestId('transcode-overlay');
    await expect(overlay).toBeVisible({ timeout: 15_000 });

    // Sam postęp transkodowania nie może tworzyć osobnego toastu do zamknięcia.
    const transcodeToasts = onda.page
      .getByTestId('toast')
      .filter({ hasText: /Transkodowanie|Transcoding/ });
    await expect(transcodeToasts).toHaveCount(0);

    // Fallback podmienia źródło na wynik transkodowania z katalogu tymczasowego.
    await expect
      .poll(
        () =>
          onda.page.evaluate(() => {
            const video = document.querySelector('video');
            return video?.src?.includes('video-transcodes') ?? false;
          }),
        { timeout: 60_000 }
      )
      .toBe(true);

    // Wynik jest odtwarzalny przez Chromium (gotowy albo już gra).
    await expect
      .poll(
        () =>
          onda.page.evaluate(() => {
            const video = document.querySelector('video');
            return video ? video.readyState >= 2 || !video.paused : false;
          }),
        { timeout: 30_000 }
      )
      .toBe(true);

    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
});
