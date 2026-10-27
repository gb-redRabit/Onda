import { test, expect } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import sharp from 'sharp';
import { launchOnda, dismissWizard } from './helpers/app';

const iconPath = resolve(__dirname, '..', 'resources', 'icon.png');

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

function parseNumbers(value: string | null): number[] {
  return (value ?? '')
    .split(',')
    .map(Number)
    .filter((item) => Number.isFinite(item));
}

test.describe('image studio tool', () => {
  let outDir = '';
  let outPath = '';

  test.beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'onda-image-studio-e2e-'));
    outPath = join(outDir, 'output.webp');
  });

  test.afterEach(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  test('moves/resizes the crop, edits annotation size and exports', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      const [studio] = await Promise.all([
        onda.app.waitForEvent('window'),
        page.evaluate((path) => {
          const api = (window as unknown as { api: OndaTestApi }).api;
          return api.invoke('tools:openWindow', 'image-studio', { path });
        }, iconPath)
      ]);
      studio.on('pageerror', (error) => onda.pageErrors.push(error.message));
      await dismissWizard(studio);
      const canvas = studio.getByTestId('image-studio-canvas');
      await expect(canvas).toBeVisible();

      const [imgW, imgH] = parseNumbers(await canvas.getAttribute('data-image'));
      const [x0, y0, w0, h0] = parseNumbers(await canvas.getAttribute('data-crop'));
      expect(w0).toBe(imgW);
      expect(h0).toBe(imgH);
      const box = await canvas.boundingBox();
      if (!box) throw new Error('canvas has no bounding box');
      const scale = box.width / imgW;

      // Rozciągnięcie kadru za prawy dolny uchwyt do wewnątrz.
      await studio.mouse.move(box.x + (x0 + w0) * scale - 10, box.y + (y0 + h0) * scale - 10);
      await studio.mouse.down();
      await studio.mouse.move(box.x + (x0 + w0) * scale - 100, box.y + (y0 + h0) * scale - 100, {
        steps: 6
      });
      await studio.mouse.up();
      const [x1, y1, w1, h1] = parseNumbers(await canvas.getAttribute('data-crop'));
      expect(w1).toBeLessThan(w0);
      expect(h1).toBeLessThan(h0);
      expect(x1).toBe(x0);
      expect(y1).toBe(y0);

      // Przesunięcie kadru chwytając jego wnętrze.
      const centerX = box.x + (x1 + w1 / 2) * scale;
      const centerY = box.y + (y1 + h1 / 2) * scale;
      await studio.mouse.move(centerX, centerY);
      await studio.mouse.down();
      await studio.mouse.move(centerX + 20, centerY + 20, { steps: 4 });
      await studio.mouse.up();
      const [x2, y2, w2, h2] = parseNumbers(await canvas.getAttribute('data-crop'));
      expect(x2).toBeGreaterThan(x1);
      expect(y2).toBeGreaterThan(y1);
      expect(w2).toBe(w1);
      expect(h2).toBe(h1);

      // Adnotacja: narysuj prostokąt i zmień jego rozmiar suwakiem (na żywo).
      await studio.getByTestId('image-studio-tool-rect').click();
      await studio.mouse.move(box.x + 40, box.y + 40);
      await studio.mouse.down();
      await studio.mouse.move(box.x + 120, box.y + 100, { steps: 4 });
      await studio.mouse.up();
      await expect(canvas).toHaveAttribute('data-annotation-count', '1');
      await studio.getByTestId('image-studio-stroke').evaluate((element, value) => {
        const input = element as HTMLInputElement;
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, 24);
      await expect(canvas).toHaveAttribute('data-selected-width', '24');

      await studio.getByTestId('image-studio-output-path').fill(outPath);
      await studio.getByTestId('image-studio-save').click();
      await expect(studio.getByTestId('image-studio-saved')).toBeVisible({ timeout: 20_000 });

      expect(existsSync(outPath)).toBe(true);
      // Bufor zamiast ścieżki: libvips na Windows trzyma handle do GC i blokuje clean-up.
      const meta = await sharp(readFileSync(outPath)).metadata();
      expect(meta.format).toBe('webp');
      expect(Math.abs((meta.width ?? 0) - w2)).toBeLessThanOrEqual(1);
      expect(Math.abs((meta.height ?? 0) - h2)).toBeLessThanOrEqual(1);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
