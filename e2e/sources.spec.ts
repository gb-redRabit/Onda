import { test, expect } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Sources (generic API module): create → select → editor → remove.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

test.describe('sources', () => {
  test('creates, opens, opens the editor for and removes a source', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);

      const saved = await page.evaluate(async () => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        return api.invoke('sources:save', {
          id: 'e2e-src',
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
      expect(saved).toMatchObject({ saved: { id: 'e2e-src' } });

      await page.reload();
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/sources';
      });
      await expect(page.locator('main[data-route]')).toHaveAttribute('data-route', 'sources');
      await expect(page.getByTestId('sources-view')).toBeVisible();

      const item = page.getByTestId('sources-item-e2e-src');
      await expect(item).toBeVisible();
      await expect(item).toContainText('E2E Source');
      await item.click();
      await expect(page.getByTestId('sources-detail')).toBeVisible();

      // New-source editor opens from the sidebar and can be cancelled.
      await page.getByTestId('sources-add').click();
      const editor = page.getByTestId('source-editor-dialog');
      await expect(editor).toBeVisible();
      await editor
        .getByRole('button', { name: /cancel|anuluj|close|zamknij/i })
        .first()
        .click();
      await expect(editor).toHaveCount(0);

      // Remove the source.
      await page.evaluate(async () => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.invoke('sources:delete', 'e2e-src');
      });
      await page.reload();
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/sources';
      });
      await expect(page.getByTestId('sources-item-e2e-src')).toHaveCount(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
