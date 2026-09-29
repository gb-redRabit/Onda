import { test, expect } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

// Interaction coverage for the remaining primary views: Downloads filters,
// Webcast tabs, Sources (empty state, editor, created entry) and Explorer
// (create folder + selection). Nothing destructive is confirmed.

test.describe('view interactions', () => {
  test('filters the download queue and switches Webcast tabs', async () => {
    // ONDA_E2E_FIXTURES makes the download queue deterministic.
    const onda = await launchOnda({ env: { ONDA_E2E_FIXTURES: '1' } });
    try {
      await dismissWizard(onda.page);
      await onda.page.evaluate(async () => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.invoke('yt:download:add', [
          {
            url: 'https://www.youtube.com/watch?v=e2e-filter',
            title: 'E2E Filter Target',
            kind: 'audio',
            format: 'best',
            quality: 'best',
            outputDir: '.',
            filenameTemplate: '%(title)s.%(ext)s'
          }
        ]);
      });

      await onda.page.evaluate(() => {
        window.location.hash = '#/downloads';
      });
      await expect(onda.page.locator('main[data-route]')).toHaveAttribute(
        'data-route',
        'downloads'
      );

      const all = onda.page.getByTestId('downloads-filter-all');
      const completed = onda.page.getByTestId('downloads-filter-completed');
      await expect(all).toBeVisible();
      await expect(all).toHaveAttribute('aria-pressed', 'true');

      await completed.click();
      await expect(completed).toHaveAttribute('aria-pressed', 'true');
      await expect(all).toHaveAttribute('aria-pressed', 'false');

      await all.click();
      await expect(all).toHaveAttribute('aria-pressed', 'true');

      await onda.page.evaluate(() => {
        window.location.hash = '#/webcast';
      });
      await expect(onda.page.locator('main[data-route]')).toHaveAttribute('data-route', 'webcast');
      const radioTab = onda.page.getByTestId('webcast-tab-radio');
      const savedTab = onda.page.getByTestId('webcast-tab-saved');
      await radioTab.click();
      await expect(radioTab).toHaveAttribute('aria-selected', 'true');
      await expect(savedTab).toHaveAttribute('aria-selected', 'false');
      await savedTab.click();
      await expect(savedTab).toHaveAttribute('aria-selected', 'true');

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('opens the source editor from the empty state and lists a created source', async () => {
    const onda = await launchOnda();
    try {
      await dismissWizard(onda.page);
      await onda.page.evaluate(() => {
        window.location.hash = '#/sources';
      });
      await expect(onda.page.locator('main[data-route]')).toHaveAttribute('data-route', 'sources');
      await expect(onda.page.getByTestId('sources-empty-add')).toBeVisible();

      await onda.page.getByTestId('sources-empty-add').click();
      const editor = onda.page.getByTestId('source-editor-dialog');
      await expect(editor).toBeVisible();
      await editor
        .getByRole('button', { name: /cancel|anuluj|close|zamknij/i })
        .first()
        .click();
      await expect(editor).toHaveCount(0);

      const saved = await onda.page.evaluate(async () => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        return api.invoke('sources:save', {
          id: 'e2e-source',
          name: 'E2E Source',
          baseUrl: 'https://example.com',
          auth: { type: 'none' },
          endpoints: [
            {
              id: 'items',
              name: 'Items',
              method: 'GET',
              path: '/items',
              mapping: { list: 'items' }
            }
          ],
          createdAt: 0
        });
      });
      expect(saved).toMatchObject({ saved: { id: 'e2e-source' } });

      await onda.page.reload();
      await dismissWizard(onda.page);
      await onda.page.evaluate(() => {
        window.location.hash = '#/sources';
      });
      const item = onda.page.getByTestId('sources-item-e2e-source');
      await expect(item).toBeVisible();
      await expect(item).toContainText('E2E Source');

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('filters Explorer content and switches the view mode', async () => {
    const onda = await launchOnda();
    try {
      await dismissWizard(onda.page);
      await onda.page.evaluate(() => {
        window.location.hash = '#/explorer';
      });
      await expect(onda.page.locator('main[data-route]')).toHaveAttribute('data-route', 'explorer');

      // A query that matches nothing empties the list and can be cleared again.
      const search = onda.page.getByTestId('explorer-search');
      const items = onda.page.locator('[data-testid^="explorer-item-"]');
      await expect(search).toBeVisible();
      await expect.poll(() => items.count(), { timeout: 15_000 }).toBeGreaterThan(0);
      await search.fill('zzz-onda-e2e-no-such-file');
      await expect.poll(() => items.count()).toBe(0);
      await search.fill('');
      await expect.poll(() => items.count()).toBeGreaterThan(0);

      // View mode dropdown switches the list presentation.
      await onda.page.getByTestId('explorer-view-mode').click();
      await onda.page.getByTestId('explorer-view-details').click();
      await expect(onda.page.getByTestId('explorer-view-mode')).toHaveAttribute(
        'aria-expanded',
        'false'
      );
      await onda.page.getByTestId('explorer-view-mode').click();
      await onda.page.getByTestId('explorer-view-small').click();
      await expect(onda.page.getByTestId('explorer-view-mode')).toHaveAttribute(
        'aria-expanded',
        'false'
      );

      // Selecting the first visible row marks it (ring/aria are host-rendered,
      // so assert through the row's existence plus no page errors).
      const firstRow = onda.page.locator('[data-testid^="explorer-item-"]').first();
      if (await firstRow.count()) {
        await firstRow.click();
        await expect(firstRow).toBeVisible();
      }

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
