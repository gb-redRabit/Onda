import { test, expect, type Page } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Wbudowane motywy + Theme Creator: przełączenie motywu musi zaktualizować
// `color-scheme` dokumentu (ciemny/jasny) i przetrwać przeładowanie.

async function setHash(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    window.location.hash = `#${h}`;
  }, hash);
}

function currentColorScheme(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.style.colorScheme);
}

test.describe('themes & creator', () => {
  test('switches built-in themes and opens the theme creator', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await setHash(page, '/settings');
      await expect(page.locator('main[data-route]')).toHaveAttribute('data-route', 'settings');

      // Otwórz zakładkę Theme z przeglądu.
      await page.getByTestId('settings-overview-theme').click();
      await expect(page.getByTestId('theme-dark')).toBeVisible();
      await expect(page.getByTestId('theme-light')).toBeVisible();
      await expect(page.getByTestId('theme-custom')).toBeVisible();

      await page.getByTestId('theme-light').click();
      await expect.poll(() => currentColorScheme(page)).toBe('light');

      await page.getByTestId('theme-dark').click();
      await expect.poll(() => currentColorScheme(page)).toBe('dark');

      // Theme Creator: ziarna custom scheme przełączają color-scheme na żywo.
      await page.getByTestId('theme-custom').click();
      await expect(page.getByTestId('theme-seed-light')).toBeVisible();
      await expect(page.getByTestId('theme-seed-dark')).toBeVisible();
      await page.getByTestId('theme-seed-light').click();
      await expect.poll(() => currentColorScheme(page)).toBe('light');

      // Wybór utrzymuje się po przeładowaniu (zapisy ustawień są debounced).
      await page.waitForTimeout(700);
      await page.reload();
      await dismissWizard(page);
      await expect.poll(() => currentColorScheme(page)).toBe('light');

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
