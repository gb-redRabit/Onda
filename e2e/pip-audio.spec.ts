import { test, expect, type ElectronApplication } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Audio PiP ma stałe wymiary dla każdego docku, więc to sprawdza (1) czy okno jest
// umieszczone tam, gdzie mówi dock, i (2) czy kontrolki w oknie emitują akcje, które
// proces główny przekazuje do odtwarzacza.

interface OndaTestApi {
  audioPipShow: (state: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<boolean>;
  audioPipUpdate: (
    state: Record<string, unknown>,
    opts?: Record<string, unknown>
  ) => Promise<boolean>;
  audioPipHide: () => Promise<boolean>;
}

const STATE = {
  trackName: 'E2E Track',
  artist: 'E2E Artist',
  coverData: null,
  coverType: null,
  isPlaying: false,
  currentTime: 0,
  duration: 100,
  volume: 0.5
};

function pipBounds(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && w.webContents.getURL().includes('audio-pip.html')
    );
    return win ? win.getBounds() : null;
  });
}

test.describe('audio PiP', () => {
  test('places the fixed-size window correctly for each dock', async () => {
    const onda = await launchOnda();
    const { page, app } = onda;
    try {
      await dismissWizard(page);
      const work = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
      const margin = 20;

      // Dock narożny: stały rozmiar karty, prawy dolny róg ze standardowym marginesem.
      await page.evaluate((s) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        return api.audioPipShow(s, { dock: 'bottom-right' });
      }, STATE);
      await expect.poll(() => pipBounds(app)).not.toBeNull();
      let b = (await pipBounds(app))!;
      expect(b.width).toBeGreaterThanOrEqual(280);
      expect(b.width).toBeLessThanOrEqual(400);
      expect(b.height).toBeGreaterThanOrEqual(56);
      expect(b.height).toBeLessThanOrEqual(150);
      // Zaokrąglanie OS/DPI może przesunąć okno o piksel lub dwa.
      expect(Math.abs(b.x - (work.x + work.width - b.width - margin))).toBeLessThanOrEqual(2);
      expect(Math.abs(b.y - (work.y + work.height - b.height - margin))).toBeLessThanOrEqual(2);

      // Inny narożnik: lewy górny używa tego samego marginesu na obu osiach.
      await page.evaluate((s) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        return api.audioPipUpdate(s, { dock: 'top-left' });
      }, STATE);
      await expect
        .poll(async () => Math.abs((await pipBounds(app))!.x - (work.x + margin)))
        .toBeLessThanOrEqual(2);
      b = (await pipBounds(app))!;
      expect(Math.abs(b.y - (work.y + margin))).toBeLessThanOrEqual(2);

      // Dolny pasek: pełna szerokość, ograniczona wysokość, równo z krawędziami ekranu.
      await page.evaluate((s) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        return api.audioPipUpdate(s, { dock: 'bottom' });
      }, STATE);
      await expect
        .poll(async () => Math.abs((await pipBounds(app))!.width - work.width))
        .toBeLessThanOrEqual(2);
      b = (await pipBounds(app))!;
      expect(b.height).toBeLessThanOrEqual(132);
      expect(Math.abs(b.x - work.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(b.y - (work.y + work.height - b.height))).toBeLessThanOrEqual(2);

      // Prawa krawędź: pełna wysokość, ograniczona szerokość, równo z prawą krawędzią.
      await page.evaluate((s) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        return api.audioPipUpdate(s, { dock: 'right' });
      }, STATE);
      await expect
        .poll(async () => Math.abs((await pipBounds(app))!.height - work.height))
        .toBeLessThanOrEqual(2);
      b = (await pipBounds(app))!;
      expect(b.width).toBeLessThanOrEqual(132);
      expect(Math.abs(b.x - (work.x + work.width - b.width))).toBeLessThanOrEqual(2);

      await page.evaluate(() => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        return api.audioPipHide();
      });
    } finally {
      await onda.dispose();
    }
  });

  test('its controls emit the matching player actions', async () => {
    const onda = await launchOnda();
    const { page, app } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(() => {
        const w = window as unknown as {
          api: { on: (c: string, cb: (v: never) => void) => () => void };
          __pipActions: string[];
          __pipProgress: number[];
        };
        w.__pipActions = [];
        w.__pipProgress = [];
        w.api.on('audio-pip:action', (a: never) => w.__pipActions.push(a as unknown as string));
        w.api.on('audio-pip:progressClick', (p: never) =>
          w.__pipProgress.push(p as unknown as number)
        );
      });

      await page.evaluate((s) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        return api.audioPipShow(s, {
          dock: 'bottom-right',
          cornerElements: ['cover', 'trackInfo', 'controls', 'progress', 'volume', 'eq']
        });
      }, STATE);

      await expect
        .poll(() => !!app.windows().find((p) => p.url().includes('audio-pip.html')))
        .toBe(true);
      const pip = app.windows().find((p) => p.url().includes('audio-pip.html'))!;

      await expect(pip.getByTestId('pip-audio-root')).toBeVisible();
      await expect(pip.getByTestId('pip-audio-root')).toContainText('E2E Track');

      for (const id of [
        'pip-playPause',
        'pip-next',
        'pip-prev',
        'pip-repeat',
        'pip-shuffle'
      ]) {
        await pip.getByTestId(id).click();
      }
      await pip.getByTestId('pip-mute').click();
      await pip.getByTestId('pip-eq-flat').click();

      // Wejście suwaka głośności.
      await pip.getByTestId('pip-volume').evaluate((el) => {
        const input = el as HTMLInputElement;
        input.value = '0.5';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

      // Przewiń, klikając pasek postępu.
      await pip.getByTestId('pip-progress').click({ position: { x: 12, y: 2 } });

      const actions = await page.evaluate(
        () => (window as unknown as { __pipActions: string[] }).__pipActions
      );
      expect(actions).toEqual(
        expect.arrayContaining([
          'playPause',
          'next',
          'prev',
          'repeat',
          'shuffle',
          'mute',
          'volume:0.50',
          'eqPreset:flat'
        ])
      );

      const progress = await page.evaluate(
        () => (window as unknown as { __pipProgress: number[] }).__pipProgress
      );
      expect(progress.length).toBeGreaterThan(0);
      expect(progress[0]).toBeGreaterThanOrEqual(0);
      expect(progress[0]).toBeLessThanOrEqual(1);

      await page.evaluate(() => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        return api.audioPipHide();
      });

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
