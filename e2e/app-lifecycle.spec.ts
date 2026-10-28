import { test } from '@playwright/test';
import { dismissWizard, launchOnda } from './helpers/app';

// Regresja P0: przy wyłączonym „zamknij do zasobnika” zamknięcie ostatniego
// widocznego okna musi zakończyć proces, nawet gdy istnieje ukryte okno audio PiP.
test('closing the main window exits when close-to-tray is disabled', async () => {
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

    const closed = onda.app.waitForEvent('close', { timeout: 15_000 });
    await onda.app.evaluate(({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes('/renderer/index.html')
      );
      if (!main) throw new Error('main window not found');
      main.close();
    });

    await closed;
  } finally {
    await onda.dispose();
  }
});
