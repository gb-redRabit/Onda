import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchOnda } from './helpers/app';

// Pusta biblioteka w compactcie nie może być ślepą uliczką: oferuje przejście
// do pełnej wersji, gdzie można dodać folder biblioteki.
test('empty compact offers the full app to add a library', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'onda-compact-empty-'));
  const onda = await launchOnda({
    windowFile: 'compact.html',
    userDataDir,
    profileSetup: (dir) => {
      writeFileSync(join(dir, 'compact-window-state.json'), JSON.stringify({ mode: 'compact' }));
    }
  });

  try {
    const page = onda.page;
    await expect(page.getByTestId('compact-root')).toBeVisible({ timeout: 20_000 });
    const cta = page.getByTestId('compact-empty-open-full');
    await expect(cta).toBeVisible({ timeout: 10_000 });
    await cta.click();

    await expect
      .poll(
        () =>
          onda.app.evaluate(({ BrowserWindow }) => {
            const main = BrowserWindow.getAllWindows().find(
              (candidate) =>
                !candidate.isDestroyed() && candidate.webContents.getURL().includes('index.html')
            );
            return main?.isVisible() ?? false;
          }),
        { timeout: 20_000 }
      )
      .toBe(true);

    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
});
