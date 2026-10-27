import { test, expect } from '@playwright/test';
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchOnda } from './helpers/app';
import { createLibraryFixture } from './helpers/media';

interface CompactApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

// Faza 3: compact startuje na Utworach, pokazuje bibliotekę, przełącza zakładki
// i steruje tym samym Core co pełny shell.
test('compact shell starts on tracks, lists the library and switches tabs', async () => {
  const media = createLibraryFixture(6);
  const onda = await launchOnda({
    windowFile: 'compact.html',
    env: {
      ONDA_COMPACT: '1',
      ONDA_CORE_SHELL_AUTOPLAY: '1'
    }
  });

  try {
    const page = onda.page;
    await expect(page.getByTestId('compact-root')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('compact-tab-tracks')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('compact-search')).toBeVisible();

    const scanned = await page.evaluate(async (dir) => {
      const api = (window as unknown as { api: CompactApi }).api;
      await api.invoke('library:saveFolders', [dir]);
      const result = (await api.invoke('library:scan', [dir])) as { count?: number } | undefined;
      return result?.count ?? 0;
    }, media.dir);
    expect(scanned).toBeGreaterThan(0);

    await page.reload();
    await expect(page.getByTestId('compact-root')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('compact-track-0')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('compact-title')).toContainText('core-spike-tone', {
      timeout: 20_000
    });
    await page.screenshot({ path: join(tmpdir(), 'onda-compact-tracks.png') });

    await page.getByTestId('compact-tab-queue').click();
    await expect(page.getByTestId('compact-queue')).toBeVisible();

    await page.getByTestId('compact-tab-albums').click();
    await expect(page.getByTestId('compact-albums')).toBeVisible();
    await expect(page.getByTestId('compact-album-0')).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: join(tmpdir(), 'onda-compact-albums.png') });

    await page.getByTestId('compact-tab-tracks').click();
    await expect(page.getByTestId('compact-tracks')).toBeVisible();
    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
    rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
});
