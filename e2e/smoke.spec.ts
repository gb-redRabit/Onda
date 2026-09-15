import { test, expect } from '@playwright/test';
import { launchOnda } from './helpers/app';

test.describe('app smoke', () => {
  test('boots the renderer with a working IPC bridge and closes cleanly', async () => {
    const onda = await launchOnda();
    try {
      await expect(onda.page.getByTestId('app-root')).toBeVisible();
      await expect(onda.page).toHaveTitle('Onda');

      // First run on a fresh profile: dismiss the onboarding wizard.
      const skip = onda.page.getByTestId('wizard-skip');
      if (await skip.isVisible().catch(() => false)) {
        await skip.click();
      }
      await expect(onda.page.getByTestId('wizard-skip')).toHaveCount(0);

      const bridge = await onda.page.evaluate(() => {
        const api = (window as unknown as { api?: { invoke?: unknown; on?: unknown } }).api;
        return {
          invoke: typeof api?.invoke === 'function',
          on: typeof api?.on === 'function'
        };
      });
      expect(bridge).toEqual({ invoke: true, on: true });

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
