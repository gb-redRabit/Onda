import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchOnda } from './helpers/app';

// Crash renderera compactu nie może zostawić martwego okna: main przeładowuje
// renderer (z limitem prób), a aplikacja wstaje bez restartu procesu.
//
// Po crashu uchwyt strony Playwrighta jest martwy ("Target crashed"), więc stan
// sprawdzamy w procesie głównym przez `executeJavaScript` na przeładowanym rendererze.
//
// macOS: wymuszenie crashu przez CDP kończy się na runnerze inaczej niż `crashed`
// (SIGTRAP / proces ubity), więc automatyczny reload nie następuje — to ten sam
// problem runnera, który opisuje AGENT-NOTES przy testach menu kontekstowego.
// Recovery jest weryfikowane na Windows i Linuksie.
test.skip(
  process.platform === 'darwin',
  'renderer crash simulation is not reliable on the macOS CI runner'
);
test('compact renderer recovers from a crash', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'onda-compact-recovery-'));
  const onda = await launchOnda({
    windowFile: 'compact.html',
    userDataDir,
    profileSetup: (dir) => {
      writeFileSync(join(dir, 'compact-window-state.json'), JSON.stringify({ mode: 'compact' }));
    }
  });

  try {
    await expect(onda.page.getByTestId('compact-root')).toBeVisible({ timeout: 20_000 });

    // Wymuś crash procesu renderera compactu (nie zamykaj okna).
    const crashed = await onda.app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(
        (candidate) =>
          !candidate.isDestroyed() && candidate.webContents.getURL().includes('compact.html')
      );
      if (!win) return false;
      win.webContents.forcefullyCrashRenderer();
      return true;
    });
    expect(crashed).toBe(true);

    // Playwright traci sesję CDP na chwilę po crashu — odczekaj, zanim
    // zapytamy proces główny o stan przeładowanego renderera.
    await new Promise((resolve) => setTimeout(resolve, 2_000));

    // Ten sam wątek okna wraca z zamontowanym UI po automatycznym reloadzie.
    await expect
      .poll(
        () =>
          onda.app.evaluate(async ({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find(
              (candidate) =>
                !candidate.isDestroyed() && candidate.webContents.getURL().includes('compact.html')
            );
            if (!win || win.webContents.isCrashed()) return false;
            try {
              return await win.webContents.executeJavaScript(
                `!!document.querySelector('[data-testid="compact-root"]') &&
                 document.querySelectorAll('[data-testid^="compact-tab-"]').length > 0`
              );
            } catch {
              // Renderer jest w trakcie przeładowania — spróbuj ponownie.
              return false;
            }
          }),
        { timeout: 40_000 }
      )
      .toBe(true);

    const compactWindowAlive = await onda.app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(
        (candidate) =>
          !candidate.isDestroyed() && candidate.webContents.getURL().includes('compact.html')
      );
      return !!win && !win.webContents.isCrashed();
    });
    expect(compactWindowAlive).toBe(true);
  } finally {
    await onda.dispose();
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
});
