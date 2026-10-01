import { test, expect, type Page } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Responsywność: każdy główny widok przy wielu rozmiarach okna, przy rzeczywistym rozmiarze
// wyświetlania (zmaksymalizowany) i w prawdziwym pełnym ekranie. Sprawdza: brak poziomego przepełnienia,
// widok wypełnia wysokość okna, główny region pozostaje w viewporcie i
// widoki pełnej szerokości faktycznie się rozszerzają. Miękkie asercje zbierają każdego winowajcę.

interface Measurement {
  innerW: number;
  innerH: number;
  docScrollW: number;
  mainClientW: number;
  mainScrollW: number;
  mainLeft: number;
  mainRight: number;
  appH: number;
}

interface ViewSpec {
  route: string;
  path: string;
  root: string;
  /** Pełnoszerokościowy widok: musi rozszerzać się do szerokości głównego regionu. */
  fill: boolean;
}

const VIEWS: ViewSpec[] = [
  { route: 'home', path: '/', root: 'home-view', fill: false }, // celowo wyśrodkowany
  { route: 'library', path: '/library', root: 'library-view', fill: true },
  { route: 'explorer', path: '/explorer', root: 'explorer-view', fill: true },
  { route: 'online', path: '/online', root: 'online-view', fill: true },
  { route: 'webcast', path: '/webcast', root: 'webcast-view', fill: true },
  { route: 'downloads', path: '/downloads', root: 'downloads-view', fill: true },
  { route: 'sources', path: '/sources', root: 'sources-view', fill: true },
  { route: 'settings', path: '/settings', root: 'settings-view', fill: true },
  { route: 'audio', path: '/audio', root: 'audio-view', fill: true }
];

const SIZES: Array<[number, number]> = [
  [2560, 1440],
  [1920, 1080],
  [1440, 900],
  [1280, 800],
  [1024, 720],
  [900, 600],
  [760, 560],
  [640, 480]
];

async function measure(page: Page): Promise<Measurement> {
  return page.evaluate(() => {
    const de = document.documentElement;
    const main = document.querySelector('main[data-route]') as HTMLElement | null;
    const app = document.querySelector('[data-testid="app-root"]') as HTMLElement | null;
    const rect = main?.getBoundingClientRect();
    return {
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      docScrollW: de.scrollWidth,
      mainClientW: main?.clientWidth ?? 0,
      mainScrollW: main?.scrollWidth ?? 0,
      mainLeft: rect?.left ?? 0,
      mainRight: rect?.right ?? 0,
      appH: app?.getBoundingClientRect().height ?? 0
    };
  });
}

/** Nawiguje do widoku i sprawdza, czy się mieści; zwraca pomiar. */
async function assertViewFits(page: Page, view: ViewSpec, tag: string): Promise<Measurement> {
  await page.evaluate((p) => {
    window.location.hash = `#${p}`;
  }, view.path);
  await expect(page.locator('main[data-route]')).toHaveAttribute('data-route', view.route);
  await page.waitForTimeout(150);

  const m = await measure(page);
  const rootBox = await page.getByTestId(view.root).boundingBox();

  expect
    .soft(m.docScrollW, `${tag}: horizontal document overflow`)
    .toBeLessThanOrEqual(m.innerW + 1);
  expect
    .soft(m.mainScrollW, `${tag}: main content overflows horizontally`)
    .toBeLessThanOrEqual(m.mainClientW + 1);
  expect.soft(m.mainLeft, `${tag}: main starts off-screen`).toBeGreaterThanOrEqual(-1);
  expect
    .soft(m.mainRight, `${tag}: main extends past the viewport`)
    .toBeLessThanOrEqual(m.innerW + 1);
  expect
    .soft(Math.abs(m.appH - m.innerH), `${tag}: app-root not full height`)
    .toBeLessThanOrEqual(1);

  expect.soft(rootBox, `${tag}: view root not rendered`).not.toBeNull();
  if (rootBox) {
    expect.soft(rootBox.width, `${tag}: view root has no width`).toBeGreaterThan(0);
    expect
      .soft(rootBox.x + rootBox.width, `${tag}: view root extends past the viewport`)
      .toBeLessThanOrEqual(m.innerW + 1);
    expect.soft(rootBox.x, `${tag}: view root starts off-screen`).toBeGreaterThanOrEqual(-1);
    if (view.fill && m.innerW >= 1280) {
      expect
        .soft(rootBox.width, `${tag}: full-width view does not expand`)
        .toBeGreaterThanOrEqual(m.mainClientW * 0.95 - 1);
    }
  }
  return m;
}

test.describe('responsive layout', () => {
  test('every view fits the window across sizes', async () => {
    const onda = await launchOnda({ env: { ONDA_E2E_FIXTURES: '1' } });
    const { page } = onda;
    try {
      await dismissWizard(page);
      await expect(page.getByTestId('app-root')).toBeVisible();

      for (const [w, h] of SIZES) {
        await page.setViewportSize({ width: w, height: h });
        for (const view of VIEWS) {
          await assertViewFits(page, view, `${view.route}@${w}x${h}`);
        }
      }

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('fills the real display when maximized and in fullscreen', async () => {
    const onda = await launchOnda({ env: { ONDA_E2E_FIXTURES: '1' } });
    const { page, app } = onda;
    try {
      await dismissWizard(page);
      const size = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().size);

      // Zmaksymalizuj główne okno na cały wyświetlacz.
      await app.evaluate(({ BrowserWindow }, s) => {
        const main = BrowserWindow.getAllWindows().find(
          (w) => !w.webContents.getURL().includes('pip') && !w.webContents.getURL().includes('splash')
        );
        main?.setBounds({ x: 0, y: 0, width: s.width, height: s.height });
      }, size);
      await page.waitForTimeout(300);

      const maximized = await measure(page);
      expect(maximized.innerW).toBeGreaterThanOrEqual(size.width - 40);
      for (const view of VIEWS) {
        await assertViewFits(page, view, `maximized ${view.route}@${maximized.innerW}`);
      }

      // Prawdziwy pełny ekran przez własne IPC aplikacji.
      const entered = await page.evaluate(async () => {
        const api = (window as unknown as { api: { invoke: (c: string) => Promise<unknown> } }).api;
        return api.invoke('window:toggleFullscreen');
      });
      expect(entered).toBe(true);
      await page.waitForTimeout(500);

      const full = await measure(page);
      expect(full.innerW).toBeGreaterThanOrEqual(size.width - 2);
      expect(full.innerH).toBeGreaterThanOrEqual(size.height - 2);
      for (const view of VIEWS) {
        await assertViewFits(page, view, `fullscreen ${view.route}@${full.innerW}x${full.innerH}`);
      }

      await page.evaluate(() => {
        const api = (window as unknown as { api: { invoke: (c: string) => Promise<unknown> } }).api;
        return api.invoke('window:exitFullscreen');
      });

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
