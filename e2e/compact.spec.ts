import { test, expect, type Page } from '@playwright/test';
import { rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { dismissWizard, launchOnda } from './helpers/app';
import { createLibraryFixture } from './helpers/media';

interface CompactApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

// Faza 4: tryb compact jest zapisany w profilu (bez env), startuje bez pełnego
// maina, pokazuje bibliotekę i przełącza się do pełnego okna z tym samym Core.
test('compact starts from saved mode and switches to full window', async () => {
  const media = createLibraryFixture(6);
  const onda = await launchOnda({
    windowFile: 'compact.html',
    profileSetup: (dir) => {
      writeFileSync(join(dir, 'compact-window-state.json'), JSON.stringify({ mode: 'compact' }));
    },
    env: {
      ONDA_CORE_SHELL_AUTOPLAY: '1'
    }
  });

  try {
    const page = onda.page;
    await expect(page.getByTestId('compact-root')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('compact-tab-tracks')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('compact-search')).toBeVisible();

    // Faza 4: w trybie compact pełny main nie powstaje wcale.
    const startupUrls = onda.app.windows().map((candidate) => candidate.url());
    expect(
      startupUrls.some(
        (url) => url.includes('/renderer/index.html') || url.includes('\\renderer\\index.html')
      )
    ).toBe(false);

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

    // Przełączenie w trakcie działania: pełne okno dostaje ten sam stan Core.
    await expect(page.getByTestId('compact-expand')).toContainText(/Pełna wersja|Full app/);
    await page.getByTestId('compact-expand').click();
    let mainPage: Page | undefined;
    await expect
      .poll(
        () => {
          mainPage = onda.app.windows().find((candidate) => {
            const url = candidate.url();
            return (
              url.includes('/renderer/index.html') ||
              url.includes('\\renderer\\index.html') ||
              url.endsWith('/index.html')
            );
          });
          return !!mainPage;
        },
        { timeout: 20_000 }
      )
      .toBe(true);

    await dismissWizard(mainPage!);
    await expect(mainPage!.getByTestId('player-bar')).toContainText('core-spike-tone', {
      timeout: 20_000
    });

    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
    rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
});
