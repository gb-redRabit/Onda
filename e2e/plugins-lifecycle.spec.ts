import { test, expect } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Cykl życia wtyczki poza przeglądem uprawnień: stan włączony utrzymuje się
// po przeładowaniu, wyłączanie nie wymaga ponownej aprobaty, a odinstalowanie ją usuwa.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

test.describe('plugin lifecycle', () => {
  test('enable persists, then disable and uninstall', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);

      for (const id of ['sleep-timer', 'vu-meter']) {
        const installed = await page.evaluate(async (pluginId) => {
          const api = (window as unknown as { api: OndaTestApi }).api;
          return api.invoke('plugins:installExample', pluginId);
        }, id);
        expect(installed).toMatchObject({ success: true, installed: { enabled: false } });
      }

      await page.evaluate(() => {
        window.location.hash = '#/settings?tab=plugins';
      });
      await expect(page.getByTestId('plugins-refresh')).toBeVisible();
      await page.getByTestId('plugins-refresh').click();

      // Włącz obie przez dialog przeglądu.
      for (const id of ['sleep-timer', 'vu-meter']) {
        await page.getByTestId(`plugin-toggle-${id}`).click();
        await page
          .getByTestId('plugin-permission-dialog')
          .getByRole('button', { name: /approve and enable|zatwierdź i włącz/i })
          .click();
        await expect(page.getByTestId(`plugin-card-${id}`)).toContainText(/Loaded|Załadowana/, {
          timeout: 15_000
        });
      }
      await page.waitForTimeout(600);

      // Stan włączony przetrwa przeładowanie.
      await page.reload();
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/settings?tab=plugins';
      });
      await page.getByTestId('plugins-refresh').click();
      await expect(page.getByTestId('plugin-card-sleep-timer')).toContainText(/Loaded|Załadowana/);
      await expect(page.getByTestId('plugin-card-vu-meter')).toContainText(/Loaded|Załadowana/);

      // Wyłączanie nie wymaga dialogu zatwierdzenia; plakietka "Enabled" znika.
      await expect(page.getByTestId('plugin-card-vu-meter')).toContainText(/Enabled|Włączona/);
      await page.getByTestId('plugin-toggle-vu-meter').click();
      await expect(page.getByTestId('plugin-permission-dialog')).toHaveCount(0);
      await expect(page.getByTestId('plugin-card-vu-meter')).not.toContainText(/Enabled|Włączona/);

      // Odinstalowanie usuwa wtyczkę z listy.
      const uninstalled = await page.evaluate(async () => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        return api.invoke('plugins:uninstall', 'sleep-timer');
      });
      expect(uninstalled).toMatchObject({ success: true });
      await page.getByTestId('plugins-refresh').click();
      await expect(page.getByTestId('plugin-card-sleep-timer')).toHaveCount(0);
      await expect(page.getByTestId('plugin-card-vu-meter')).toBeVisible();

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
