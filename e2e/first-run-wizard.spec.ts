import { test, expect } from '@playwright/test';
import { launchOnda } from './helpers/app';

// Step navigation of the first-run wizard. A fresh profile mounts it
// automatically (App.vue), so the helper that only clicks "skip" is deliberately
// not used here.

const LAST_STEP = 8; // 9 steps, zero-indexed

test.describe('first-run wizard', () => {
  test('walks every step, finishes, and can be re-opened from settings', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      const wizard = page.getByTestId('wizard');
      await expect(wizard).toBeVisible({ timeout: 15_000 });

      const body = page.getByTestId('wizard-step-body');
      await expect(body).toHaveAttribute('data-step', '0');
      await expect(page.getByTestId('wizard-back')).toBeDisabled();

      // Forward through every step; the step host index advances one at a time.
      for (let step = 1; step <= LAST_STEP; step++) {
        await page.getByTestId('wizard-next').click();
        await expect(body).toHaveAttribute('data-step', String(step));
      }

      // Back and forward again keep the same step host.
      await page.getByTestId('wizard-back').click();
      await expect(body).toHaveAttribute('data-step', String(LAST_STEP - 1));
      await page.getByTestId('wizard-next').click();
      await expect(body).toHaveAttribute('data-step', String(LAST_STEP));

      // The last step's button completes the wizard.
      await page.getByTestId('wizard-next').click();
      await expect(wizard).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem('onda-first-run-done')))
        .toBe('1');

      // Settings can re-open the wizard, and it starts at the first step again.
      await page.evaluate(() => {
        window.location.hash = '#/settings?tab=general';
      });
      await expect(page.getByTestId('settings-open-wizard')).toBeVisible();
      await page.getByTestId('settings-open-wizard').click();
      await expect(wizard).toBeVisible();
      await expect(body).toHaveAttribute('data-step', '0');

      // "Skip everything" closes it from any step.
      await page.getByTestId('wizard-next').click();
      await expect(body).toHaveAttribute('data-step', '1');
      await page.getByTestId('wizard-skip').click();
      await expect(wizard).toHaveCount(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
