import { test, expect } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// E2E dla providerów linków (zakładka „Linki"): ONDA_E2E_FIXTURES sprawia, że
// providers:detect/list/downloaded zwracają deterministyczne dane (bez sieci),
// a ścieżki UI (auto-detekcja, breadcrumb, pobranie, oznaczenia) pozostają prawdziwe.

test.describe('online providers (Linki)', () => {
  test('detects a provider link, browses folders and queues a download', async () => {
    const onda = await launchOnda({ env: { ONDA_E2E_FIXTURES: '1' } });
    try {
      const { page } = onda;
      await expect(page.getByTestId('app-root')).toBeVisible();
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/online';
      });

      const input = page.getByTestId('online-search-input');
      await expect(input).toBeVisible();
      await input.fill('https://mypikpak.com/s/e2e.provider');
      await input.press('Enter');

      // Auto-detekcja przełącza na zakładkę „Linki" i wczytuje zawartość.
      await expect(page.getByTestId('providers-detected')).toContainText('PikPak');
      await expect(page.getByTestId('providers-expiring')).toBeVisible();
      await expect(page.getByTestId('providers-folder')).toHaveCount(1);
      await expect(page.getByTestId('providers-file')).toHaveCount(2);

      // Trwałe oznaczenie „✓ Pobrano" dla file-2.
      await expect(page.getByTestId('providers-downloaded')).toHaveCount(1);

      // Nawigacja w folder i powrót przez breadcrumb.
      await page.getByTestId('providers-folder').click();
      await expect(page.getByTestId('providers-file')).toHaveCount(1);
      await expect(page.getByTestId('providers-file')).toContainText('Nested Clip.mp4');
      await page.getByRole('button', { name: 'PikPak' }).first().click();
      await expect(page.getByTestId('providers-file')).toHaveCount(2);

      // Pobranie pliku 1:1 trafia do kolejki.
      await page.getByTestId('providers-download').first().click();
      await page.evaluate(() => {
        window.location.hash = '#/downloads';
      });
      const row = page.getByTestId('download-row').first();
      await expect(row).toBeVisible();
      await expect(row).toContainText('Movie One.mp4');

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('provider requiring a cookie offers sign-in from the panel', async () => {
    const onda = await launchOnda({ env: { ONDA_E2E_FIXTURES: '1' } });
    try {
      const { page } = onda;
      await expect(page.getByTestId('app-root')).toBeVisible();
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/online';
      });

      const input = page.getByTestId('online-search-input');
      await input.fill('https://mypikpak.com/s/e2e.provider.cookie');
      await input.press('Enter');

      await expect(page.getByTestId('providers-detected')).toContainText('PikPak');
      await expect(page.getByTestId('providers-cred-state')).toBeVisible();

      // Okno cookie: wklejanie ORAZ „Zaloguj się" (nowe okno logowania).
      await page.getByTestId('providers-cookie').click();
      await expect(page.getByTestId('providers-cookie-input')).toBeVisible();
      await expect(page.getByTestId('providers-cookie-login')).toBeVisible();

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('credentials screen lists required and optional providers', async () => {
    const onda = await launchOnda({ env: { ONDA_E2E_FIXTURES: '1' } });
    try {
      const { page } = onda;
      await expect(page.getByTestId('app-root')).toBeVisible();
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/settings?tab=network-platform';
      });

      const panel = page.getByTestId('settings-provider-credentials');
      await expect(panel).toBeVisible();
      await expect(panel).toContainText('Google Drive');
      await expect(page.locator('[data-testid^="cred-state-"]')).toHaveCount(2);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
