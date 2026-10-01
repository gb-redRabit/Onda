import { test, expect } from '@playwright/test';
import { rmSync } from 'fs';
import { basename } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';
import { createImageFixture } from './helpers/media';

// Test obciążeniowy przeglądarki obrazów: 55 prawdziwych PNG. Weryfikuje, że pasek miniatur renderuje się
// (okienkowany wokół aktywnego indeksu), aktywna miniatura jest podświetlona,
// wyśrodkowana i przewinięta do widoku, plus nawigacja, zoom/obrót/dopasowanie, pokaz slajdów
// i przełącznik miniatur.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

const COUNT = 55;

test.describe('image viewer', () => {
  const fixture = createImageFixture(COUNT);

  test.afterAll(() => {
    rmSync(fixture.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  function fileItems() {
    return fixture.files.map((path) => ({
      name: basename(path),
      path,
      isDirectory: false,
      size: 1,
      modifiedAt: 0,
      createdAt: 0,
      extension: 'png',
      mimeType: 'image/png'
    }));
  }

  test('renders many thumbnails, centres the active one and supports the controls', async () => {
    const onda = await launchOnda();
    const { page, app } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(async (first) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.grantMediaAccess(first);
      }, fixture.files[0]);

      const midIndex = 40;
      const windowPromise = app.waitForEvent('window');
      await page.evaluate(
        async ({ files, index }) => {
          const api = (window as unknown as { api: OndaTestApi }).api;
          await api.invoke('imageViewer:open', files, index);
        },
        { files: fileItems(), index: midIndex }
      );
      const viewer = await windowPromise;

      await expect(viewer.locator('main[data-route]')).toHaveAttribute(
        'data-route',
        'image-viewer'
      );
      await expect(viewer.getByTestId('image-viewer')).toBeVisible();
      await expect(viewer.getByTestId('image-viewer-counter')).toHaveText(
        `${midIndex + 1} / ${COUNT}`
      );
      await expect(viewer.getByTestId('image-viewer-image')).toBeVisible({ timeout: 20_000 });

      // Miniatury są okienkowane wokół aktywnego indeksu (nie wszystkie 55 naraz).
      const thumbCount = await viewer.locator('[data-thumb-idx]').count();
      expect(thumbCount).toBeGreaterThan(30);
      expect(thumbCount).toBeLessThan(COUNT);

      // Aktywna miniatura jest podświetlona.
      const active = viewer.locator(`[data-thumb-idx="${midIndex}"]`);
      await expect(active).toHaveClass(/border-primary/);

      // Pasek automatycznie się przewija, aby aktywna miniatura była wyśrodkowana i widoczna.
      const strip = viewer.getByTestId('image-viewer-strip');
      await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      const placement = await viewer.evaluate((idx) => {
        const s = document.querySelector('[data-testid="image-viewer-strip"]') as HTMLElement;
        const a = document.querySelector(`[data-thumb-idx="${idx}"]`) as HTMLElement;
        if (!s || !a) return { inView: false, delta: 9999 };
        const sr = s.getBoundingClientRect();
        const ar = a.getBoundingClientRect();
        return {
          inView: ar.left >= sr.left - 1 && ar.right <= sr.right + 1,
          delta: Math.abs(ar.left + ar.width / 2 - (sr.left + sr.width / 2))
        };
      }, midIndex);
      expect(placement.inView).toBe(true);
      expect(placement.delta).toBeLessThan(80);

      // Next / previous przenoszą aktywny indeks i jego podświetlenie. Każda nawigacja
      // rozpoczyna ~500ms przejście, które celowo blokuje następne, więc
      // pozwalamy mu się ustabilizować między krokami.
      const settle = () => viewer.waitForTimeout(650);
      await viewer.getByTestId('image-viewer-next').click();
      await expect(viewer.getByTestId('image-viewer-counter')).toHaveText(
        `${midIndex + 2} / ${COUNT}`
      );
      await expect(viewer.locator(`[data-thumb-idx="${midIndex + 1}"]`)).toHaveClass(
        /border-primary/
      );
      await settle();
      await viewer.getByTestId('image-viewer-prev').click();
      await expect(viewer.getByTestId('image-viewer-counter')).toHaveText(
        `${midIndex + 1} / ${COUNT}`
      );
      await settle();
      // Obsługa klawiatury (ArrowRight) przesuwa ponownie.
      await viewer.evaluate(() =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
      );
      await expect(viewer.getByTestId('image-viewer-counter')).toHaveText(
        `${midIndex + 2} / ${COUNT}`
      );
      await settle();

      // Kliknięcie wyrenderowanej miniatury przeskakuje do niej (pasek jest okienkowany).
      await viewer.locator('[data-thumb-idx="20"]').click();
      await expect(viewer.getByTestId('image-viewer-counter')).toHaveText(`21 / ${COUNT}`);

      // Odczyty zoom / obrót / dopasowanie.
      await viewer.getByTestId('image-viewer-zoom-in').click();
      await expect(viewer.getByTestId('image-viewer-scale')).toBeVisible();
      await viewer.getByTestId('image-viewer-rotate').click();
      await expect(viewer.getByTestId('image-viewer-rotation')).toHaveText('90°');
      await viewer.getByTestId('image-viewer-fit').click();
      await expect(viewer.getByTestId('image-viewer-scale')).toHaveCount(0);

      // Pokaz slajdów przełącza się i eksponuje pasek postępu.
      await viewer.getByTestId('image-viewer-slideshow').click();
      await expect(viewer.getByTestId('image-viewer-slideshow-progress')).toBeVisible();
      await viewer.getByTestId('image-viewer-slideshow').click();
      await expect(viewer.getByTestId('image-viewer-slideshow-progress')).toHaveCount(0);

      // Przełącznik miniatur zwija i ponownie otwiera pasek.
      await viewer.getByTestId('image-viewer-thumbnails-toggle').click();
      await expect(strip).toHaveClass(/h-0/);
      await viewer.getByTestId('image-viewer-thumbnails-toggle').click();
      await expect(strip).toHaveClass(/h-20/);

      // Zamknij z paska narzędzi.
      await viewer.getByTestId('image-viewer-close').click();
      await expect.poll(() => viewer.isClosed()).toBe(true);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
