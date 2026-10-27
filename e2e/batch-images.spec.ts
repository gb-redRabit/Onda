import { test, expect } from '@playwright/test';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import sharp from 'sharp';
import { launchOnda, dismissWizard } from './helpers/app';

const iconPath = resolve(__dirname, '..', 'resources', 'icon.png');

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

test('batch images converts and resizes preloaded images', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'onda-batch-images-e2e-'));
  const outDir = join(dir, 'out');
  const inputA = join(dir, 'a.png');
  const inputB = join(dir, 'b.png');
  copyFileSync(iconPath, inputA);
  copyFileSync(iconPath, inputB);

  const onda = await launchOnda();
  const { page } = onda;
  try {
    await dismissWizard(page);
    const [tool] = await Promise.all([
      onda.app.waitForEvent('window'),
      page.evaluate(
        (paths) => {
          const api = (window as unknown as { api: OndaTestApi }).api;
          return api.invoke('tools:openWindow', 'batch-images', { paths });
        },
        [inputA, inputB]
      )
    ]);
    tool.on('pageerror', (error) => onda.pageErrors.push(error.message));
    await dismissWizard(tool);
    await expect(tool.getByTestId('batch-images-view')).toBeVisible();

    await tool.getByTestId('batch-images-format').selectOption('webp');
    await tool.getByTestId('batch-images-width').fill('64');
    await tool.getByTestId('batch-images-output').fill(outDir);
    await tool.getByTestId('batch-images-start').click();
    await expect(tool.getByTestId('batch-images-row-done')).toHaveCount(2, { timeout: 20_000 });

    const outputA = join(outDir, 'a.webp');
    const outputB = join(outDir, 'b.webp');
    expect(existsSync(outputA)).toBe(true);
    expect(existsSync(outputB)).toBe(true);
    // Bufor zamiast ścieżki: libvips na Windows trzyma handle do GC i blokuje clean-up.
    const meta = await sharp(readFileSync(outputA)).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(64);
    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
