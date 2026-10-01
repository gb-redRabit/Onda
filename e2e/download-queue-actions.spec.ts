import { test, expect, type Locator, type Page } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Download-queue row actions against the deterministic lifecycle fixtures:
// pending jobs stay queued (`#hold`), `#downloading` jobs stay active, so
// pause / resume / cancel / retry / clear-finished can be asserted without
// racing the real download timers.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

function job(title: string, fragment: string) {
  return {
    url: `https://www.youtube.com/watch?v=e2e-${fragment}${fragment ? `#${fragment}` : ''}`,
    title,
    kind: 'audio',
    format: 'best',
    quality: 'best',
    outputDir: '.',
    filenameTemplate: '%(title)s.%(ext)s'
  };
}

function row(page: Page, title: string): Locator {
  return page.getByTestId('download-row').filter({ hasText: title });
}

test.describe('download queue actions', () => {
  test('pauses, resumes, cancels, retries and deletes queued items', async () => {
    const onda = await launchOnda({ env: { ONDA_E2E_FIXTURES: '1' } });
    const { page } = onda;
    try {
      await dismissWizard(page);

      await page.evaluate(
        async (jobs) => {
          const api = (window as unknown as { api: OndaTestApi }).api;
          await api.invoke('yt:download:add', jobs);
        },
        [job('E2E Hold', 'hold'), job('E2E Live', 'downloading'), job('E2E Done', 'done')]
      );

      await page.evaluate(() => {
        window.location.hash = '#/downloads';
      });

      const rows = page.getByTestId('download-row');
      await expect(rows).toHaveCount(3);

      const hold = row(page, 'E2E Hold');
      const live = row(page, 'E2E Live');
      const done = row(page, 'E2E Done');

      // Pause an active download.
      await expect(live.getByTestId('download-action-pause')).toBeVisible({ timeout: 10_000 });
      await live.getByTestId('download-action-pause').click();
      await expect(live.getByTestId('download-action-resume')).toBeVisible();

      // Resume it back to the queue.
      await live.getByTestId('download-action-resume').click();
      await expect(live.getByTestId('download-action-cancel')).toBeVisible();

      // Cancel it, then retry the cancelled row (a fresh job replaces it).
      await live.getByTestId('download-action-cancel').click();
      await expect(live.getByTestId('download-action-retry')).toBeVisible();
      await live.getByTestId('download-action-retry').click();
      await expect(live.getByTestId('download-action-retry')).toHaveCount(0);
      await expect(rows).toHaveCount(3);

      // The untouched job reaches completion, then clear-finished removes it.
      await expect(done.getByTestId('download-action-play')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('downloads-clear-finished').click();
      await expect(done).toHaveCount(0);
      await expect(rows).toHaveCount(2);

      // Cancel + retry a still-pending job.
      await hold.getByTestId('download-action-cancel').click();
      await expect(hold.getByTestId('download-action-retry')).toBeVisible();
      await hold.getByTestId('download-action-retry').click();
      await expect(hold.getByTestId('download-action-retry')).toHaveCount(0);
      await expect(rows).toHaveCount(2);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
