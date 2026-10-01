import { test, expect, type Page } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Zachowanie wtyczki poza instalacją/zatwierdzeniem: uruchamianie zarejestrowanego polecenia z
// globalnej palety poleceń oraz utrwalanie formularza ustawień wtyczki.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

async function enablePlugin(page: Page, id: string): Promise<void> {
  await page.evaluate(async (pluginId) => {
    const api = (window as unknown as { api: OndaTestApi }).api;
    const installed = (await api.invoke('plugins:installExample', pluginId)) as {
      success: boolean;
    };
    if (!installed?.success) throw new Error(`install ${pluginId} failed`);
  }, id);
  await page.evaluate(() => {
    window.location.hash = '#/settings?tab=plugins';
  });
  await expect(page.getByTestId('plugins-refresh')).toBeVisible();
  await page.getByTestId('plugins-refresh').click();
  await page.getByTestId(`plugin-toggle-${id}`).click();
  await page
    .getByTestId('plugin-permission-dialog')
    .getByRole('button', { name: /approve and enable|zatwierdź i włącz/i })
    .click();
  await expect(page.getByTestId(`plugin-card-${id}`)).toContainText(/Loaded|Załadowana/, {
    timeout: 15_000
  });
}

test.describe('plugin command palette', () => {
  test('runs a plugin command from the command palette', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await enablePlugin(page, 'hello');

      // Polecenie wtyczki jest jedynym dopasowaniem dla jego charakterystycznej etykiety.
      await page.keyboard.press('Control+k');
      await expect(page.getByTestId('app-search-input')).toBeFocused();
      await page.getByTestId('app-search-input').fill('powiedz');
      const item = page.locator('#app-search-item-0');
      await expect(item).toContainText(/powiedz cześć/i);
      await item.click();

      await expect(page.getByTestId('app-search')).toHaveCount(0);
      await expect(page.getByTestId('toast').filter({ hasText: 'Cześć!' })).toBeVisible({
        timeout: 10_000
      });

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});

test.describe('plugin settings form', () => {
  test('saves a plugin setting and keeps it across a reload', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await enablePlugin(page, 'sleep-timer');

      const minutes = page.getByTestId('plugin-setting-sleep-timer-minutes');
      await expect(minutes).toBeVisible();
      await minutes.fill('45');
      await minutes.press('Tab');

      await expect
        .poll(async () => {
          return page.evaluate(async () => {
            const api = (window as unknown as { api: OndaTestApi }).api;
            const stored = (await api.invoke('plugins:settings:get', 'sleep-timer')) as {
              minutes?: number;
            };
            return stored?.minutes;
          });
        })
        .toBe(45);

      // Formularz odzwierciedla zapisaną wartość po pełnym przeładowaniu.
      await page.reload();
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/settings?tab=plugins';
      });
      await page.getByTestId('plugins-refresh').click();
      await expect(page.getByTestId('plugin-setting-sleep-timer-minutes')).toHaveValue('45');

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
