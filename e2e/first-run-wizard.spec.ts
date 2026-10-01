import { test, expect } from '@playwright/test';
import { launchOnda } from './helpers/app';

// Nawigacja krokami kreatora pierwszego uruchomienia. Świeży profil montuje go
// automatycznie (App.vue), więc helper, który tylko klika "skip", jest celowo
// tutaj nieużywany.

const LAST_STEP = 8; // 9 kroków, indeksowane od zera

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

      // Do przodu przez każdy krok; indeks hosta kroków zwiększa się o jeden naraz.
      for (let step = 1; step <= LAST_STEP; step++) {
        await page.getByTestId('wizard-next').click();
        await expect(body).toHaveAttribute('data-step', String(step));
      }

      // Wstecz i ponownie do przodu utrzymują ten sam host kroków.
      await page.getByTestId('wizard-back').click();
      await expect(body).toHaveAttribute('data-step', String(LAST_STEP - 1));
      await page.getByTestId('wizard-next').click();
      await expect(body).toHaveAttribute('data-step', String(LAST_STEP));

      // Przycisk ostatniego kroku kończy kreatora.
      await page.getByTestId('wizard-next').click();
      await expect(wizard).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem('onda-first-run-done')))
        .toBe('1');

      // Settings może ponownie otworzyć kreatora, a on startuje znów od pierwszego kroku.
      await page.evaluate(() => {
        window.location.hash = '#/settings?tab=general';
      });
      await expect(page.getByTestId('settings-open-wizard')).toBeVisible();
      await page.getByTestId('settings-open-wizard').click();
      await expect(wizard).toBeVisible();
      await expect(body).toHaveAttribute('data-step', '0');

      // "Skip everything" zamyka go z dowolnego kroku.
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
