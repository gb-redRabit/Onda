import { test, expect } from '@playwright/test';
import { dismissWizard, launchOnda } from './helpers/app';

interface CoreShellApi {
  invoke: (channel: string) => Promise<{ isPlaying?: boolean; enginePlaying?: boolean } | null>;
  send: (channel: string, ...args: unknown[]) => void;
}

// Weryfikuje, że główne okno w trybie Core shell odbija stan ukrytego Core
// i że komenda z shellu dociera do właściciela audio.
test('core shell mirrors hidden playback and accepts commands', async () => {
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

    const before = await page.evaluate(() => {
      const api = (window as unknown as { api: CoreShellApi }).api;
      return api.invoke('core:getState');
    });
    expect(before?.isPlaying).toBe(true);

    await page.evaluate(() => {
      const api = (window as unknown as { api: CoreShellApi }).api;
      api.send('core:command', { type: 'pause' });
    });

    await expect
      .poll(
        async () =>
          (
            await page.evaluate(() => {
              const api = (window as unknown as { api: CoreShellApi }).api;
              return api.invoke('core:getState');
            })
          )?.isPlaying,
        { timeout: 5_000 }
      )
      .toBe(false);

    await expect(bar).toHaveAttribute('data-playing', 'false', { timeout: 5_000 });
    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
  }
});
