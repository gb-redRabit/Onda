import { test, expect, type ElectronApplication } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchOnda } from './helpers/app';
import { createMediaFixture } from './helpers/media';

interface CompactPipApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

function pipWindow(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(
      (candidate) =>
        !candidate.isDestroyed() && candidate.webContents.getURL().includes('audio-pip.html')
    );
    return win ? { visible: win.isVisible() } : null;
  });
}

// Compact jest shellem audio-only, ale PiP audio ma działać jak w pełnej aplikacji:
// bez przycisku w UI, automatycznie po schowaniu okna do tray.
test('compact auto-shows audio PiP when hidden to tray', async () => {
  const media = createMediaFixture(8);
  const userDataDir = mkdtempSync(join(tmpdir(), 'onda-compact-pip-'));
  const onda = await launchOnda({
    windowFile: 'compact.html',
    userDataDir,
    profileSetup: (dir) => {
      writeFileSync(join(dir, 'compact-window-state.json'), JSON.stringify({ mode: 'compact' }));
    },
    env: { ONDA_CORE_SHELL_AUTOPLAY: '1' }
  });

  try {
    const page = onda.page;
    await expect(page.getByTestId('compact-root')).toBeVisible({ timeout: 20_000 });

    const scanned = await page.evaluate(
      async ({ dir, audio }) => {
        const api = (window as unknown as { api: CompactPipApi }).api;
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

    // Powrót do pełnej aplikacji jest tylko ikoną z opisem w tooltipie; PiP audio
    // nie ma osobnego przycisku (zachowuje się jak w pełnej aplikacji).
    await expect(page.getByTestId('compact-expand')).toHaveAttribute(
      'title',
      /Otwórz pełną|open full app/i
    );
    await expect(page.getByTestId('compact-pip')).toHaveCount(0);

    await page.getByTestId('compact-track-0').click();
    await expect(page.getByTestId('compact-play')).toHaveAttribute('data-playing', 'true', {
      timeout: 10_000
    });
    const coreState = () =>
      page.evaluate(async () => {
        const api = (
          window as unknown as {
            api: { invoke: (c: string) => Promise<Record<string, unknown> | null> };
          }
        ).api;
        return api.invoke('core:getState');
      });
    await expect
      .poll(async () => (await coreState())?.enginePlaying, { timeout: 20_000 })
      .toBe(true);

    // Schowanie compactu do tray automatycznie pokazuje PiP (domyślne ustawienie).
    await page.keyboard.press('Escape');
    await expect
      .poll(
        () =>
          onda.app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().some((win) => win.isVisible())
          ),
        { timeout: 10_000 }
      )
      .toBe(true);
    await expect
      .poll(() => pipWindow(onda.app), { timeout: 10_000 })
      .toMatchObject({
        visible: true
      });

    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
    rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
});
