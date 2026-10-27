import { test, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { dismissWizard, launchOnda } from './helpers/app';
import { createLibraryFixture, createMediaFixture } from './helpers/media';

interface SessionApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

// Compact nie ma routera, więc restore sesji idzie bezpośrednio do playera Core:
// ścieżki → MediaFile → grant → current + queue, z wznowieniem zapisanej pozycji.
test('compact restores the last session when enabled', async () => {
  const media = createMediaFixture(8);
  const userDataDir = mkdtempSync(join(tmpdir(), 'onda-compact-session-'));
  const onda = await launchOnda({
    windowFile: 'compact.html',
    userDataDir,
    profileSetup: (dir) => {
      writeFileSync(join(dir, 'compact-window-state.json'), JSON.stringify({ mode: 'compact' }));
    }
  });

  try {
    const page = onda.page;
    await expect(page.getByTestId('compact-root')).toBeVisible({ timeout: 20_000 });

    // Włącz „Przywróć ostatnią sesję” przez to samo IPC, którego używa UI.
    const saved = await page.evaluate(async () => {
      const api = (window as unknown as { api: SessionApi }).api;
      const settings = (await api.invoke('settings:get')) as {
        general?: Record<string, unknown>;
      };
      return api.invoke('settings:set', {
        general: { ...(settings.general ?? {}), restoreSession: true }
      });
    });
    expect(saved).toBe(true);

    // Zasiej sesję tak, jak zapisałaby ją poprzednia sesja aplikacji.
    await page.addInitScript(
      ({ path }) => {
        localStorage.setItem('onda-session', JSON.stringify({ currentPath: path, queue: [path] }));
      },
      { path: media.wavPath }
    );

    await page.reload();
    await expect(page.getByTestId('compact-root')).toBeVisible({ timeout: 20_000 });

    // Po starcie compactu utwór wraca z sesji, a Core go odtwarza.
    await expect(page.getByTestId('compact-title')).toContainText('tone', { timeout: 20_000 });
    await expect(page.getByTestId('compact-play')).toHaveAttribute('data-playing', 'true', {
      timeout: 20_000
    });

    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
    rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
});

// Przełączenie z klasycznego maina restartuje proces. Sesja jest zapisywana
// synchronicznie przed wyjściem, a stan okna niesie jednorazowy znacznik restore.
test('legacy main hands the session to compact across the automatic relaunch', async () => {
  const media = createLibraryFixture(3);
  const userDataDir = mkdtempSync(join(tmpdir(), 'onda-compact-handoff-'));
  const onda = await launchOnda({ userDataDir });

  try {
    const page = onda.page;
    await dismissWizard(page);
    const scanned = await page.evaluate(
      async ({ dir, first }) => {
        const api = (window as unknown as { api: SessionApi }).api;
        await api.invoke('library:saveFolders', [dir]);
        const result = (await api.invoke('library:scan', [dir])) as { count?: number } | undefined;
        await api.grantMediaAccess(first);
        return result?.count ?? 0;
      },
      { dir: media.dir, first: media.wavPaths[0] }
    );
    expect(scanned).toBeGreaterThan(0);

    await page.reload();
    await dismissWizard(page);
    await page.evaluate(() => {
      window.location.hash = '#/library';
    });
    await page.getByTestId('library-tab-tracks').click();
    await page.getByTestId('library-track-play').first().click();
    await expect(page.locator('[data-testid="player-bar"][data-playing="true"]')).toBeVisible({
      timeout: 20_000
    });

    const closed = onda.app.waitForEvent('close', { timeout: 15_000 });
    await page
      .getByTestId('window-switch-compact')
      .click()
      .catch(() => {
        /* okno może zniknąć w trakcie automatycznego restartu */
      });
    await closed.catch(() => {});

    // Stan okna: compact + jednorazowe odtworzenie sesji.
    const state = JSON.parse(
      readFileSync(join(userDataDir, 'compact-window-state.json'), 'utf8')
    ) as { mode?: string; restoreSessionOnce?: boolean };
    expect(state.mode).toBe('compact');
    expect(state.restoreSessionOnce).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 500));
    const compact = await launchOnda({ windowFile: 'compact.html', userDataDir });
    try {
      await expect(compact.page.getByTestId('compact-title')).toContainText('tone', {
        timeout: 20_000
      });
      await expect(compact.page.getByTestId('compact-play')).toHaveAttribute(
        'data-playing',
        'true',
        { timeout: 20_000 }
      );

      const consumed = JSON.parse(
        readFileSync(join(userDataDir, 'compact-window-state.json'), 'utf8')
      ) as { mode?: string; restoreSessionOnce?: boolean };
      expect(consumed.restoreSessionOnce).not.toBe(true);
      expect(compact.pageErrors).toEqual([]);
    } finally {
      await compact.dispose();
    }
  } finally {
    rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
});
