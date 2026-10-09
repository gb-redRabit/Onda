import { test, expect, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { launchOnda, dismissWizard } from './helpers/app';

// Pełny przebieg widoku Źródła na lokalnym fixture (bez internetu): tryby widoku,
// galeria + lightbox, multi-select, builder zapytań i kreator faz.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

async function startFixture(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    const host = req.headers.host ?? '127.0.0.1';
    const base = `http://${host}`;
    if (req.url?.startsWith('/items')) {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          items: [
            {
              id: 'i1',
              title: 'Foto 1',
              type: 'image',
              thumbnail: `${base}/img/1.png`,
              mediaUrl: `${base}/img/1.png`
            },
            {
              id: 'i2',
              title: 'Foto 2',
              type: 'image',
              thumbnail: `${base}/img/2.png`,
              mediaUrl: `${base}/img/2.png`
            },
            {
              id: 'i3',
              title: 'Klip 3',
              type: 'video',
              duration: '1:00',
              thumbnail: `${base}/img/3.png`,
              mediaUrl: `${base}/media/3.mp4`
            }
          ]
        })
      );
      return;
    }
    if (req.url?.startsWith('/img/')) {
      res.setHeader('content-type', 'image/png');
      res.end(PNG);
      return;
    }
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><title>media</title><body>ok</body>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

/** Uruchamia Onda, zapisuje źródło na fixture z danym widokiem i otwiera jego listę. */
async function openSource(
  view: string,
  endpointExtra: Record<string, unknown>,
  run: (page: Page) => Promise<void>
): Promise<void> {
  const fixture = await startFixture();
  const onda = await launchOnda();
  const { page } = onda;
  try {
    await dismissWizard(page);
    await page.evaluate(
      async ({ baseUrl, view, extra }) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.invoke('sources:save', {
          id: 'e2e-view',
          name: 'View Source',
          baseUrl,
          auth: { type: 'none' },
          allowPrivateNetwork: true,
          endpoints: [
            {
              id: 'items',
              name: 'Items',
              method: 'GET',
              path: '/items',
              view,
              mapping: {
                arrayPath: 'items',
                fields: {
                  id: 'id',
                  title: 'title',
                  type: 'type',
                  thumbnail: 'thumbnail',
                  mediaUrl: 'mediaUrl',
                  duration: 'duration'
                }
              },
              ...extra
            }
          ],
          createdAt: 0
        });
      },
      { baseUrl: fixture.url, view, extra: endpointExtra }
    );

    await page.reload();
    await dismissWizard(page);
    await page.evaluate(() => {
      window.location.hash = '#/sources';
    });
    await expect(page.getByTestId('sources-view')).toBeVisible();
    await page.getByTestId('sources-item-e2e-view').click();
    await expect(page.getByTestId('sources-detail')).toBeVisible();

    await run(page);
    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
    await fixture.close();
  }
}

test.describe('sources view', () => {
  test('gallery renders tiles and opens a navigable lightbox', async () => {
    await openSource('gallery', {}, async (page) => {
      const tiles = page.getByTestId('source-gallery-tile');
      await expect(tiles).toHaveCount(3, { timeout: 10_000 });

      await tiles.first().click();
      const lightbox = page.getByTestId('source-lightbox');
      await expect(lightbox).toBeVisible();
      await expect(lightbox).toContainText('1 / 3');

      await lightbox.press('ArrowRight');
      await expect(lightbox).toContainText('2 / 3');

      // Filmstrip: wybór ostatniej miniatury.
      await lightbox.locator('button').last().click();
      await expect(lightbox).toContainText('3 / 3');

      await page.keyboard.press('Escape');
      await expect(lightbox).toHaveCount(0);
    });
  });

  test('compact view renders the dense list', async () => {
    await openSource('compact', {}, async (page) => {
      await expect(page.getByTestId('sources-compact')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('sources-compact')).toContainText('Foto 1');
    });
  });

  test('multi-select toggles cards with shift-range and bulk bar', async () => {
    await openSource('cards', {}, async (page) => {
      await expect(page.getByText('Foto 1')).toBeVisible({ timeout: 10_000 });

      await page.getByTestId('sources-select-toggle').click();
      const bar = page.getByTestId('sources-bulk-bar');
      const count = page.getByTestId('sources-selected-count');
      await expect(bar).toBeVisible();
      await expect(count).toContainText('0');

      await page.getByText('Foto 1').click();
      await expect(count).toContainText('1');

      await page.getByText('Klip 3').click({ modifiers: ['Shift'] });
      await expect(count).toContainText('3');

      // Wyczyść zaznaczenie (X w pasku).
      await bar.getByRole('button').last().click();
      await expect(count).toContainText('0');
    });
  });

  test('query builder renders a control per endpoint param', async () => {
    await openSource('cards', { params: { rating: 'safe', page: '1' } }, async (page) => {
      const builder = page.getByTestId('sources-query-builder');
      await expect(builder).toBeVisible({ timeout: 10_000 });
      await expect(builder.locator('input')).toHaveCount(2);
      await expect(builder).toContainText('rating');
    });
  });

  test('editor opens as a phased wizard and adds an endpoint phase', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/sources';
      });
      await expect(page.getByTestId('sources-view')).toBeVisible();

      await page.getByTestId('sources-add').click();
      const editor = page.getByTestId('source-editor-dialog');
      await expect(editor).toBeVisible();

      // Faza 0 (Źródło) + Faza „Test".
      await expect(editor.getByRole('tab')).toHaveCount(2);
      await editor.getByTestId('sources-phase-add').click();
      await expect(editor.getByRole('tab')).toHaveCount(3);

      await editor
        .getByRole('button', { name: /cancel|anuluj/i })
        .first()
        .click();
      await expect(editor).toHaveCount(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('multi-select works in the carousel view', async () => {
    await openSource('carousel', {}, async (page) => {
      await expect(page.getByText('Foto 1')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('sources-select-toggle').click();
      const count = page.getByTestId('sources-selected-count');
      await page.getByText('Foto 1').click();
      await expect(count).toContainText('1');
      await page.getByText('Klip 3').click();
      await expect(count).toContainText('2');
    });
  });

  test('multi-select works in the player view', async () => {
    await openSource('player', {}, async (page) => {
      await expect(page.getByTestId('sources-player')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('sources-select-toggle').click();
      const count = page.getByTestId('sources-selected-count');
      // Scena pokazuje pierwszą pozycję, więc klikamy inną (jednoznaczny tytuł).
      await page.getByText('Klip 3').click();
      await expect(count).toContainText('1');
    });
  });

  test('editor test shows the raw response and masked headers', async () => {
    await openSource('cards', {}, async (page) => {
      await page.getByTestId('sources-item-e2e-view').hover();
      await page.getByTestId('sources-edit-item').click();
      const editor = page.getByTestId('source-editor-dialog');
      await expect(editor).toBeVisible();

      // Ostatnia faza „Test" uruchamia globalny test połączenia.
      await editor.getByRole('tab').last().click();
      await editor.getByTestId('sources-phase-test-run').click();
      await expect(editor.getByTestId('source-test-raw')).toBeVisible({ timeout: 15_000 });
      await expect(editor.getByTestId('source-test-headers')).toBeVisible();
    });
  });

  test('play now starts a stream and shows it in the player bar', async () => {
    await openSource('cards', {}, async (page) => {
      await expect(page.getByText('Klip 3')).toBeVisible({ timeout: 10_000 });
      await page.getByText('Klip 3').click();
      const modal = page.getByTestId('source-detail-modal');
      await expect(modal).toBeVisible();
      await modal.getByTestId('source-play-now').click();
      await expect(page.getByTestId('player-bar').first()).toContainText('Klip 3', {
        timeout: 10_000
      });
    });
  });
});
