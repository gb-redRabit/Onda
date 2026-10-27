import { test, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchOnda } from './helpers/app';
import { createMediaFixture } from './helpers/media';

interface CompactControlsApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

function readPinned(dir: string): boolean {
  try {
    const state = JSON.parse(readFileSync(join(dir, 'compact-window-state.json'), 'utf8')) as {
      alwaysOnTop?: boolean;
    };
    return state.alwaysOnTop === true;
  } catch {
    return false;
  }
}

// Polish compactu: skróty klawiszowe, trwały pin i Esc→tray.
test('compact keyboard shortcuts, pin persistence and hide to tray', async () => {
  const media = createMediaFixture(8);
  const userDataDir = mkdtempSync(join(tmpdir(), 'onda-compact-profile-'));
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
        const api = (window as unknown as { api: CompactControlsApi }).api;
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

    // Ctrl+F z innej zakładki wraca na Utwory i ustawia fokus w wyszukiwaniu.
    await page.getByTestId('compact-tab-albums').click();
    await expect(page.getByTestId('compact-tab-albums')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Control+f');
    await expect(page.getByTestId('compact-tab-tracks')).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid')))
      .toBe('compact-search');

    // Odtworzenie utworu i pauza spacją (poza polami formularzy).
    await page.getByTestId('compact-track-0').click();
    await expect(page.getByTestId('compact-title')).toContainText('tone', { timeout: 10_000 });
    await expect(page.getByTestId('compact-play')).toHaveAttribute('data-playing', 'true', {
      timeout: 10_000
    });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Space');
    await expect(page.getByTestId('compact-play')).toHaveAttribute('data-playing', 'false');

    // Strzałki przewijają o 5 s (fixture ma 8 s), bez wychodzenia poza zakres.
    const currentTime = () =>
      page.evaluate(() =>
        Number(
          document
            .querySelector('[data-testid="compact-progress"]')
            ?.getAttribute('aria-valuenow') ?? 0
        )
      );
    await page.keyboard.press('ArrowRight');
    await expect.poll(currentTime).toBeGreaterThan(4);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(currentTime).toBeLessThan(1);

    // Pin zapisuje się w stanie okna i jest odczytywany przez IPC.
    const getPinned = () =>
      page.evaluate(async () => {
        const api = (window as unknown as { api: CompactControlsApi }).api;
        return api.invoke('app:getCompactPinned');
      });
    await page.getByTestId('compact-pin').click();
    await expect.poll(getPinned).toBe(true);
    await expect.poll(() => readPinned(userDataDir)).toBe(true);
    await page.getByTestId('compact-pin').click();
    await expect.poll(getPinned).toBe(false);
    await expect.poll(() => readPinned(userDataDir)).toBe(false);

    // Compact sam zapisuje sesję (utwór + kolejka) do localStorage — ten sam
    // profil czyta ją potem pełne okno i kolejny start compactu.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const raw = localStorage.getItem('onda-session');
            if (!raw) return '';
            try {
              return (JSON.parse(raw) as { currentPath?: string }).currentPath ?? '';
            } catch {
              return '';
            }
          }),
        { timeout: 10_000 }
      )
      .toContain('tone');

    // Esc chowa okno do tray (odtwarzanie zostaje w Core). PiP audio może się
    // w tym momencie pokazać automatycznie — sprawdzamy samo okno compactu.
    await page.keyboard.press('Escape');
    await expect
      .poll(
        () =>
          onda.app.evaluate(({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find(
              (candidate) =>
                !candidate.isDestroyed() && candidate.webContents.getURL().includes('compact.html')
            );
            return win?.isVisible() ?? false;
          }),
        { timeout: 10_000 }
      )
      .toBe(false);

    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
    rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
});
