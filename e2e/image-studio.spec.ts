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

test.describe('image studio tool', () => {
  let outDir = '';
  let outPath = '';

  test.beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'onda-image-studio-e2e-'));
    outPath = join(outDir, 'output.webp');
  });

  test.afterEach(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('opens an image, exports it and keeps the output valid', async () => {
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
      await expect(studio.getByTestId('image-studio-view')).toBeVisible();
      await expect(studio.getByTestId('image-studio-canvas')).toBeVisible();

      await studio.getByTestId('image-studio-output-path').fill(outPath);
      await studio.getByTestId('image-studio-save').click();
      await expect(studio.getByTestId('image-studio-saved')).toBeVisible({ timeout: 20_000 });

      expect(existsSync(outPath)).toBe(true);
      // Bufor zamiast ścieżki: libvips na Windows trzyma handle do GC i blokuje clean-up.
      const meta = await sharp(readFileSync(outPath)).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBeGreaterThan(0);
      expect(meta.height).toBeGreaterThan(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
