import { test, expect } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Regresja: wejście na dysk (np. C:) pokazywało w adresie „C:" (ścieżka względna
// dysku) i nie wchodziło do korzenia. Poprawnie: katalog dysku to „C:\", breadcrumb
// pokazuje „C:\", a widok listuje zawartość korzenia.

test.describe('explorer drive navigation', () => {
  test('enters a drive root and shows C:\\ in the breadcrumb', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);

      // Widok dysków: nawiguj do korzenia drzewa ('' = drives).
      await page.evaluate(() => {
        window.location.hash = '#/explorer';
      });
      await expect(page.locator('main[data-route]')).toHaveAttribute('data-route', 'explorer');

      const driveItem = page.getByTestId('explorer-item-C:').first();
      // Dyski są dostępne tylko na Windows; macOS/Linux pokazują inny pojedynczy root.
      const isWindows = process.platform === 'win32';
      if (!isWindows) {
        test.skip(true, 'drive letters are Windows-only');
        return;
      }

      await expect(driveItem).toBeVisible({ timeout: 15_000 });

      // Dwuklik wchodzi do korzenia dysku (widok listy plików).
      await driveItem.dblclick();

      // Breadcrumb: pierwszy segment to „C:" i nawiguje do „C:\" (z separatorem).
      const crumb = page.getByTestId('explorer-crumb-0');
      await expect(crumb).toBeVisible();
      await expect(crumb).toHaveText('C:');
      await expect(crumb).toHaveAttribute('data-crumb-path', 'C:\\');

      // Nie jesteśmy już w widoku dysków — korzeń listuje foldery (ex. Users/Windows)
      // albo co najmniej nie pokazuje ponownie tego samego widoku dysków.
      await expect
        .poll(async () => page.locator('[data-testid^="explorer-item-"]').count())
        .toBeGreaterThan(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
