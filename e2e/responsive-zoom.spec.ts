import { test, expect, type Page } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Cały UI jest projektowany w px przy 100% zoomu, ale użytkownicy z dużym DPI
// przeglądają aplikację przy powiększeniu. Ten przebieg sprawdza, że przy 150%
// żaden widok nie wychodzi w poziomie — inaczej pojawia się poziomy scrollbar
// albo ucięta kolumna.

const VIEWS: Array<{ route: string; path: string; root: string }> = [
  { route: 'home', path: '/', root: 'home-view' },
  { route: 'library', path: '/library', root: 'library-view' },
  { route: 'explorer', path: '/explorer', root: 'explorer-view' },
  { route: 'online', path: '/online', root: 'online-view' },
  { route: 'webcast', path: '/webcast', root: 'webcast-view' },
  { route: 'downloads', path: '/downloads', root: 'downloads-view' },
  { route: 'sources', path: '/sources', root: 'sources-view' },
  { route: 'settings', path: '/settings', root: 'settings-view' },
  { route: 'tools', path: '/tools', root: 'tools-hub' }
];

async function measureOverflow(
  page: Page
): Promise<{ docScrollW: number; innerW: number; mainScrollW: number; mainClientW: number }> {
  return page.evaluate(() => {
    const de = document.documentElement;
    const main = document.querySelector('main[data-route]') as HTMLElement | null;
    return {
      docScrollW: de.scrollWidth,
      innerW: window.innerWidth,
      mainScrollW: main?.scrollWidth ?? 0,
      mainClientW: main?.clientWidth ?? 0
    };
  });
}

test.describe('responsive layout at 150% zoom', () => {
  test('every view stays within the window', async () => {
    const onda = await launchOnda({ env: { ONDA_E2E_FIXTURES: '1' } });
    const { page, app } = onda;
    try {
      await dismissWizard(page);
      await page.setViewportSize({ width: 1280, height: 800 });
      await app.evaluate(({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows().find(
          (win) =>
            !win.webContents.getURL().includes('pip') &&
            !win.webContents.getURL().includes('splash')
        );
        main?.webContents.setZoomFactor(1.5);
      });
      await page.waitForTimeout(500);

      // Upewnij się, że zoom faktycznie obowiązuje (CSS px kurczą się ~1/1.5).
      const zoomedWidth = await page.evaluate(() => window.innerWidth);
      expect(zoomedWidth).toBeLessThan(1100);

      for (const view of VIEWS) {
        await page.evaluate((p) => {
          window.location.hash = `#${p}`;
        }, view.path);
        await expect(page.locator('main[data-route]')).toHaveAttribute('data-route', view.route);
        await expect(page.getByTestId(view.root)).toBeVisible();
        await page.waitForTimeout(200);

        const m = await measureOverflow(page);
        expect
          .soft(m.docScrollW, `${view.route}@150%: document overflows horizontally`)
          .toBeLessThanOrEqual(m.innerW + 1);
        expect
          .soft(m.mainScrollW, `${view.route}@150%: main content overflows horizontally`)
          .toBeLessThanOrEqual(m.mainClientW + 1);
      }

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
