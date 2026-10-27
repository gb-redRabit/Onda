import { test, expect, type ElectronApplication } from '@playwright/test';
import { dismissWizard, launchOnda } from './helpers/app';

interface CoreApi {
  invoke: (channel: string) => Promise<Record<string, unknown> | null>;
}

function coreProcessId(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(
      (candidate) =>
        !candidate.isDestroyed() && candidate.webContents.getURL().includes('core.html')
    );
    return win ? win.webContents.getOSProcessId() : 0;
  });
}

// Core jest ukrytym właścicielem audio. Crash renderera nie może wyzerować
// utworu/kolejki/pozycji — main odtwarza Core i wysyła mu ostatni snapshot.
test('hidden core recovers from a renderer crash', async () => {
  const onda = await launchOnda({
    env: {
      ONDA_CORE_SHELL: '1',
      ONDA_CORE_SHELL_AUTOPLAY: '1'
    }
  });

  try {
    const page = onda.page;
    await dismissWizard(page);
    const bar = page.getByTestId('player-bar').first();
    await expect(bar).toContainText('core-spike-tone', { timeout: 20_000 });
    await expect(bar).toHaveAttribute('data-playing', 'true', { timeout: 10_000 });

    const before = await page.evaluate(async () => {
      const api = (window as unknown as { api: CoreApi }).api;
      return api.invoke('core:getState');
    });
    const beforeTime = Number(before?.currentTime ?? 0);
    const beforePid = await coreProcessId(onda.app);
    expect(beforePid).toBeGreaterThan(0);

    await onda.app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(
        (candidate) =>
          !candidate.isDestroyed() && candidate.webContents.getURL().includes('core.html')
      );
      win?.webContents.forcefullyCrashRenderer();
    });

    // Nowy proces Core (reload lub odtworzone okno) i przywrócony stan.
    await expect.poll(() => coreProcessId(onda.app), { timeout: 20_000 }).not.toBe(beforePid);
    await expect
      .poll(
        async () => {
          const state = await page.evaluate(async () => {
            const api = (window as unknown as { api: CoreApi }).api;
            return api.invoke('core:getState');
          });
          return {
            name: String(state?.current && (state.current as { name?: string }).name),
            playing: state?.isPlaying === true,
            engine: state?.enginePlaying === true,
            time: Number(state?.currentTime ?? 0)
          };
        },
        { timeout: 20_000 }
      )
      .toMatchObject({ name: 'core-spike-tone.wav', playing: true, engine: true });
    const after = await page.evaluate(async () => {
      const api = (window as unknown as { api: CoreApi }).api;
      return api.invoke('core:getState');
    });
    expect(Number(after?.currentTime ?? 0)).toBeGreaterThan(beforeTime - 1);

    // Shell przyjął nowy, niższy revision po restarcie Core i dalej gra.
    await expect(bar).toContainText('core-spike-tone');
    await expect(bar).toHaveAttribute('data-playing', 'true');

    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
  }
});
