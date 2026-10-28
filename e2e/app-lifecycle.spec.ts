import { test, expect } from '@playwright/test';
import { dismissWizard, launchOnda } from './helpers/app';

// Regresja P0: przy wyłączonym „zamykaj do zasobnika” zamknięcie ostatniego
// widocznego okna musi zakończyć proces, nawet gdy istnieje ukryte okno audio PiP.
// macOS jest wyjątkiem: tam aplikacja zostaje w Docku po zamknięciu okna
// (konwencja systemowa, patrz `handleShellClosed` w `src/main/index.ts`).
test('closing the main window quits everything except on macOS', async () => {
  const onda = await launchOnda();
  try {
    await dismissWizard(onda.page);

    await onda.page.evaluate(async () => {
      const api = (
        window as unknown as {
          api: {
            invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
            audioPipPrewarm?: () => Promise<boolean>;
          };
        }
      ).api;
      await api.invoke('app:setCloseToTray', false);
      // Wymuś ukryte okno PiP: bez poprawki utrzymywałoby proces przy życiu
      // i blokowało `window-all-closed`.
      await api.audioPipPrewarm?.();
    });

    const expectQuit = process.platform !== 'darwin';
    const closed = expectQuit ? onda.app.waitForEvent('close', { timeout: 15_000 }) : null;

    await onda.app.evaluate(({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes('/renderer/index.html')
      );
      if (!main) throw new Error('main window not found');
      main.close();
    });

    if (expectQuit) {
      await closed;
      return;
    }

    // macOS: proces żyje dalej, ale okna (łącznie z ukrytym PiP) są zniszczone,
    // więc nic nie blokuje ponownego otwarcia z Docka.
    await expect
      .poll(
        () =>
          onda.app.evaluate(
            ({ BrowserWindow }) =>
              BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed()).length
          ),
        { timeout: 10_000 }
      )
      .toBe(0);
    expect(onda.app.process().exitCode).toBeNull();
  } finally {
    await onda.dispose();
  }
});
