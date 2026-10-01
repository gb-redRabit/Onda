import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Odłączone okno eksploratora można swobodnie zmieniać rozmiar: przy każdym rozmiarze strona nie może
// przepełniać, eksplorator musi ją wypełniać, a jego pasek narzędzi musi nadal działać.

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SIZES: Bounds[] = [
  { x: 0, y: 0, width: 1200, height: 800 },
  { x: 0, y: 0, width: 1000, height: 700 },
  { x: 0, y: 0, width: 820, height: 600 },
  { x: 0, y: 0, width: 900, height: 620 }
];

async function setBounds(app: ElectronApplication, winId: number, bounds: Bounds): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, args) => BrowserWindow.fromId(args.id)?.setBounds(args.bounds),
    { id: winId, bounds }
  );
}

function measure(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const main = document.querySelector('main[data-route]') as HTMLElement | null;
    const root = document.querySelector(
      '[data-testid="explorer-window-root"]'
    ) as HTMLElement | null;
    const view = document.querySelector('[data-testid="explorer-view"]') as HTMLElement | null;
    const rr = root?.getBoundingClientRect();
    const vr = view?.getBoundingClientRect();
    return {
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      docScrollW: de.scrollWidth,
      mainClientW: main?.clientWidth ?? 0,
      mainScrollW: main?.scrollWidth ?? 0,
      mainRight: main?.getBoundingClientRect().right ?? 0,
      rootW: rr?.width ?? 0,
      rootH: rr?.height ?? 0,
      viewW: vr?.width ?? 0
    };
  });
}

test.describe('detached explorer window layout', () => {
  test('lays out at several sizes and its toolbar works', async () => {
    const onda = await launchOnda();
    const { page, app } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/explorer';
      });
      await expect
        .poll(() => page.locator('[data-testid^="explorer-item-"]').count(), { timeout: 15_000 })
        .toBeGreaterThan(0);

      const windowPromise = app.waitForEvent('window');
      await page.getByTestId('explorer-open-window').click();
      const detached = await windowPromise;
      await expect(detached.getByTestId('explorer-window-root')).toBeVisible();
      const winId = await detached.evaluate(() =>
        (window as unknown as { api: { getWindowId: () => Promise<number> } }).api.getWindowId()
      );

      for (const bounds of SIZES) {
        await setBounds(app, winId, bounds);
        await detached.waitForTimeout(250);
        const m = await measure(detached);
        const tag = `${bounds.width}x${bounds.height}`;

        expect.soft(m.docScrollW, `${tag}: document overflow`).toBeLessThanOrEqual(m.innerW + 1);
        expect
          .soft(m.mainScrollW, `${tag}: main overflows horizontally`)
          .toBeLessThanOrEqual(m.mainClientW + 1);
        expect
          .soft(m.mainRight, `${tag}: main past the viewport`)
          .toBeLessThanOrEqual(m.innerW + 1);
        expect
          .soft(Math.abs(m.rootW - m.innerW), `${tag}: window root width`)
          .toBeLessThanOrEqual(2);
        expect
          .soft(Math.abs(m.rootH - m.innerH), `${tag}: window root height`)
          .toBeLessThanOrEqual(2);
        expect
          .soft(m.viewW, `${tag}: explorer does not fill the window`)
          .toBeGreaterThanOrEqual(m.mainClientW * 0.95 - 1);
      }

      // Pasek narzędzi nadal działa w odłączonym oknie.
      const search = detached.getByTestId('explorer-search');
      const items = detached.locator('[data-testid^="explorer-item-"]');
      await expect.poll(() => items.count(), { timeout: 15_000 }).toBeGreaterThan(0);
      await search.fill('zzz-onda-e2e-no-such-file');
      await expect.poll(() => items.count()).toBe(0);
      await search.fill('');
      await expect.poll(() => items.count()).toBeGreaterThan(0);

      await detached.getByTestId('explorer-view-mode').click();
      await expect(detached.getByTestId('explorer-view-details')).toBeVisible();
      await detached.getByTestId('explorer-view-details').click();

      const closed = detached.waitForEvent('close');
      await detached.evaluate(() =>
        (window as unknown as { api: { invoke: (c: string) => Promise<unknown> } }).api.invoke(
          'window:close'
        )
      );
      await closed;

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
