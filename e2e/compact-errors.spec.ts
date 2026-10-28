import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchOnda } from './helpers/app';

// Testowy przełącznik backendu wymusza błąd loadScannedChunk, żeby sprawdzić
// realny banner i retry bez uszkadzania plików na dysku.
test('compact shows a library error with retry', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'onda-compact-error-'));
  const onda = await launchOnda({
    windowFile: 'compact.html',
    userDataDir,
    profileSetup: (dir) => {
      writeFileSync(join(dir, 'compact-window-state.json'), JSON.stringify({ mode: 'compact' }));
    },
    env: { ONDA_E2E_FIXTURES: '1', ONDA_E2E_LIBRARY_FAIL: '1' }
  });

  try {
    const page = onda.page;
    await expect(page.getByTestId('compact-root')).toBeVisible({ timeout: 20_000 });
    const banner = page.getByTestId('compact-library-error');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('compact-library-retry')).toBeVisible();

    // Retry czyści poprzedni błąd i próbuje ponownie (tutaj nadal kończy się błędem).
    await page.getByTestId('compact-library-retry').click();
    await expect(banner).toBeVisible({ timeout: 15_000 });

    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
});
