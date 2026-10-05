import { test, expect, type Page } from '@playwright/test';
import { rmSync } from 'fs';
import { launchOnda, dismissWizard } from './helpers/app';
import { createLibraryFixture } from './helpers/media';

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

// Zaznaczanie utworów w zakładce Utwory: pojedynczy klik, Ctrl (pojedyncze),
// Shift (zakres), checkbox, akcje paska zbiorczego, Esc oraz widok siatki.
// Regresja z audytu: wcześniej dawało się zaznaczyć tylko jeden utwór.

async function seedLibrary(page: Page, dir: string): Promise<void> {
  await dismissWizard(page);
  const scanned = await page.evaluate(async (folder) => {
    const api = (window as unknown as { api: OndaTestApi }).api;
    await api.invoke('library:saveFolders', [folder]);
    const result = (await api.invoke('library:scan', [folder])) as { count?: number } | undefined;
    return result?.count ?? 0;
  }, dir);
  expect(scanned).toBeGreaterThanOrEqual(3);

  // Zapisz debounced library-scanned.json, potem wczytaj bibliotekę od nowa.
  await page.waitForTimeout(1000);
  await page.evaluate(() => localStorage.setItem('onda.libraryTab', 'tracks'));
  await page.reload();
  await dismissWizard(page);
  await page.evaluate(() => {
    window.location.hash = '#/library';
  });
}

test.describe('library track selection', () => {
  const media = createLibraryFixture(4);

  test.afterAll(() => {
    rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('plain clicks toggle multiple tracks, Shift ranges and Esc clears', async () => {
    const onda = await launchOnda();
    try {
      await seedLibrary(onda.page, media.dir);

      const rows = onda.page.getByTestId('library-track');
      await expect(rows.first()).toBeVisible();
      await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(4);

      const bar = onda.page.getByTestId('library-selection-bar');
      const first = rows.nth(0);
      const second = rows.nth(1);
      const third = rows.nth(2);

      // Zwykły klik zaznacza jeden utwór…
      await first.click();
      await expect(bar).toBeVisible();
      await expect(bar).toContainText('1');

      // …a kolejny klik (BEZ Ctrl) dokłada następny — multi-select bez modyfikatora.
      await second.click();
      await expect(bar).toContainText('2');
      await expect(first).toHaveClass(/bg-primary/);
      await expect(second).toHaveClass(/bg-primary/);

      // Ponowny klik tego samego utworu zdejmuje zaznaczenie.
      await second.click();
      await expect(bar).toContainText('1');

      // Shift+klik zaznacza zakres od ostatniego punktu (1..3).
      await third.click({ modifiers: ['Shift'] });
      await expect(bar).toContainText('3');

      // Esc czyści zaznaczenie.
      await onda.page.keyboard.press('Escape');
      await expect(bar).toHaveCount(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('checkbox selects a single track and bar actions work, then clears', async () => {
    const onda = await launchOnda();
    try {
      await seedLibrary(onda.page, media.dir);

      const boxes = onda.page.getByTestId('library-track-select');
      await expect(boxes.first()).toBeVisible();
      await boxes.first().check();

      const bar = onda.page.getByTestId('library-selection-bar');
      await expect(bar).toBeVisible();
      await expect(bar).toContainText('1');

      // Przy pojedynczym utworze etykiety mówią wprost o utworze.
      await expect(bar).toContainText(/track to queue|utwór do kolejki/i);

      // Dodaj do kolejki — akcja przechodzi i czyści zaznaczenie (kolejka
      // odtwarzania żyje w rendererze, więc weryfikujemy zachowanie UI).
      await bar.getByRole('button', { name: /track to queue|utwór do kolejki/i }).click();
      await expect(bar).toHaveCount(0);

      // Ponowne zaznaczenie + jawny przycisk czyszczenia.
      await boxes.nth(0).check();
      await expect(bar).toBeVisible();
      await bar.getByTestId('library-selection-clear').click();
      await expect(bar).toHaveCount(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('selects and deselects a track from its context menu', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await seedLibrary(page, media.dir);

      const rows = page.getByTestId('library-track');
      await expect(rows.first()).toBeVisible();

      const menuItem = (re: RegExp) =>
        page.getByTestId('context-menu-item').filter({ hasText: re });

      // "Oznacz" w menu kontekstowym zaznacza utwór.
      await rows.first().click({ button: 'right' });
      await expect(page.getByTestId('context-menu')).toBeVisible();
      await menuItem(/^(select|oznacz)$/i).click();
      const bar = page.getByTestId('library-selection-bar');
      await expect(bar).toContainText('1');

      // Ponowne otwarcie oferuje "Odznacz" i odznacza.
      await rows.first().click({ button: 'right' });
      await menuItem(/deselect|odznacz/i).click();
      await expect(bar).toHaveCount(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('grid view selects multiple tracks via checkboxes and card clicks', async () => {
    const onda = await launchOnda();
    try {
      await seedLibrary(onda.page, media.dir);

      // Przełącz widok na siatkę (przycisk z jawnym testid).
      await onda.page.getByTestId('library-view-grid').click();
      const cards = onda.page.getByTestId('library-track-card');
      await expect(cards.first()).toBeVisible();

      const bar = onda.page.getByTestId('library-selection-bar');

      // Dwa checkboxy → dwa zaznaczone.
      const selects = onda.page.getByTestId('library-track-select');
      await selects.nth(0).check();
      await selects.nth(1).check();
      await expect(bar).toContainText('2');

      // Sam klik karty też przełącza (bez modyfikatora) i nie nakłada wierszy:
      // wszystkie widoczne karty mają dodatnią wysokość i nie zachodzą na siebie.
      await cards.nth(2).click();
      await expect(bar).toContainText('3');

      const boxes = await cards.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
        })
      );
      // Posortowane po top: kolejny wiersz nie może zaczynać się ponad końcem poprzedniego
      // (poza sąsiadami w tym samym wierszu o identycznym top).
      const sorted = [...boxes].sort((a, b) => a.top - b.top);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].top === sorted[i - 1].top) continue; // ten sam wiersz
        expect(sorted[i].top).toBeGreaterThanOrEqual(sorted[i - 1].bottom);
      }

      await onda.page.keyboard.press('Escape');
      await expect(bar).toHaveCount(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
