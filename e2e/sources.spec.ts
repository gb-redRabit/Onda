import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { launchOnda, dismissWizard } from './helpers/app';

// Sources (generyczny moduł API): utwórz → wybierz → edytor → usuń.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

// Lokalne, deterministyczne źródło danych: lista elementów + strona embed.
// Loopback jest dozwolony, bo źródło ma `allowPrivateNetwork` i `baseUrl` w tym
// samym origin (patrz `privateNetworkAllowedForTarget`).
async function startFixture(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    const host = req.headers.host ?? '127.0.0.1';
    if (req.url?.startsWith('/items')) {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          items: [
            { id: 'ep1', title: 'Odcinek 1', playerUrl: `http://${host}/embed/1`, type: 'video' },
            { id: 'ep2', title: 'Odcinek 2', playerUrl: `http://${host}/embed/2`, type: 'video' }
          ]
        })
      );
      return;
    }
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><title>embed</title><body>embed ok</body>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
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

      // Edytor nowego źródła otwiera się z paska bocznego i można go anulować.
      await page.getByTestId('sources-add').click();
      const editor = page.getByTestId('source-editor-dialog');
      await expect(editor).toBeVisible();
      await editor
        .getByRole('button', { name: /cancel|anuluj|close|zamknij/i })
        .first()
        .click();
      await expect(editor).toHaveCount(0);

      // Usuń źródło.
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

  test('reorders sources and persists the order', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);

      await page.evaluate(async () => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        const make = (id: string, name: string, createdAt: number) => ({
          id,
          name,
          baseUrl: `https://${id}.example`,
          auth: { type: 'none' },
          endpoints: [
            { id: `${id}-e`, name: 'E', method: 'GET', path: '/', mapping: { fields: {} } }
          ],
          createdAt
        });
        await api.invoke('sources:save', make('ord-a', 'A', 1));
        await api.invoke('sources:save', make('ord-b', 'B', 2));
        await api.invoke('sources:reorder', ['ord-b', 'ord-a']);
      });

      const order = await page.evaluate(async () => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        const list = (await api.invoke('sources:list')) as Array<{ id: string }>;
        return list.map((s) => s.id);
      });
      expect(order.slice(0, 2)).toEqual(['ord-b', 'ord-a']);

      // Kolejność utrwalona po przeładowaniu.
      await page.reload();
      await dismissWizard(page);
      const afterReload = await page.evaluate(async () => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        const list = (await api.invoke('sources:list')) as Array<{ id: string }>;
        return list.map((s) => s.id);
      });
      expect(afterReload.slice(0, 2)).toEqual(['ord-b', 'ord-a']);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('renders a carousel-configured source from a local fixture and opens the item modal', async () => {
    const fixture = await startFixture();
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);

      await page.evaluate(async (baseUrl) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.invoke('sources:save', {
          id: 'e2e-carousel',
          name: 'Carousel Source',
          baseUrl,
          auth: { type: 'none' },
          allowPrivateNetwork: true,
          endpoints: [
            {
              id: 'items',
              name: 'Items',
              method: 'GET',
              path: '/items',
              view: 'carousel',
              mapping: {
                arrayPath: 'items',
                fields: {
                  id: 'id',
                  title: 'title',
                  playerUrl: 'playerUrl',
                  type: 'video'
                }
              }
            }
          ],
          createdAt: 0
        });
      }, fixture.url);

      await page.reload();
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/sources';
      });
      await expect(page.getByTestId('sources-view')).toBeVisible();

      await page.getByTestId('sources-item-e2e-carousel').click();
      await expect(page.getByTestId('sources-detail')).toBeVisible();

      // Skonfigurowany widok `carousel` renderuje karuzelę z danymi z fixture.
      const carousel = page.getByTestId('sources-carousel');
      await expect(carousel).toBeVisible({ timeout: 10_000 });
      await expect(carousel).toContainText('Odcinek 1');
      await expect(carousel).toContainText('Odcinek 2');

      // Klik pozycji otwiera modal ze szczegółami i osadzonym playerem.
      await carousel.getByText('Odcinek 1').click();
      const title = page.locator('#source-detail-modal-title');
      await expect(title).toBeVisible();
      await expect(title).toContainText('Odcinek 1');
      await expect(page.getByTestId('embed-webview')).toBeVisible();

      // Zamknięcie modala (przycisk okna „Zamknij" jest poza zakresem dialogu).
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /close|zamknij/i })
        .click();
      await expect(title).toHaveCount(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
      await fixture.close();
    }
  });
});
