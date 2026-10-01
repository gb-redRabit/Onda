import { test, expect } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Command palette (Ctrl+K, global) and view search (Ctrl+F, current view).

test.describe('command palette', () => {
  test('Ctrl+K opens the palette and runs an action; Ctrl+F opens view search', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/library';
      });
      await expect(page.locator('main[data-route]')).toHaveAttribute('data-route', 'library');

      // Global palette: an empty query lists every view action.
      await page.keyboard.press('Control+k');
      await expect(page.getByTestId('app-search')).toBeVisible();
      await expect(page.getByTestId('app-search-input')).toBeVisible();
      await expect(page.getByTestId('app-search-input')).toBeFocused();
      await expect(page.locator('#app-search-item-0')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('app-search')).toHaveCount(0);

      // Running the first action (Home) navigates and closes the palette.
      await page.keyboard.press('Control+k');
      await expect(page.locator('#app-search-item-0')).toBeVisible();
      await page.locator('#app-search-item-0').click();
      await expect(page.getByTestId('app-search')).toHaveCount(0);
      await expect(page.locator('main[data-route]')).toHaveAttribute('data-route', 'home');

      // Ctrl+F view search on a searchable view (no global results list).
      await page.evaluate(() => {
        window.location.hash = '#/library';
      });
      await page.keyboard.press('Control+f');
      await expect(page.getByTestId('app-search')).toBeVisible();
      await expect(page.getByTestId('app-search-input')).toBeFocused();
      await expect(page.locator('#app-search-results')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('app-search')).toHaveCount(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
