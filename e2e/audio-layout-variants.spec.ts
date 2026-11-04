import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createMediaFixture } from './helpers/media';
import { launchOnda, dismissWizard } from './helpers/app';

test('progress variants from the editor reach the live view', async () => {
  const media = createMediaFixture(8);
  const profile = mkdtempSync(join(tmpdir(), 'onda-variants-'));
  const onda = await launchOnda({ userDataDir: profile });
  const { page } = onda;
  try {
    await dismissWizard(page);
    await page.evaluate(async (dir) => {
      const api = (
        window as unknown as { api: { invoke: (c: string, ...a: unknown[]) => Promise<unknown> } }
      ).api;
      await api.invoke('library:saveFolders', [dir]);
      await api.invoke('library:scan', [dir]);
    }, media.dir);
    await page.reload();
    await dismissWizard(page);

    await page.evaluate(() => {
      window.location.hash = '#/library';
    });
    await page.getByTestId('library-tab-tracks').click();
    await page.getByTestId('library-track-play').first().click();
    await expect(page.locator('[data-testid="player-bar"][data-playing="true"]')).toBeVisible({
      timeout: 20_000
    });
    await page.evaluate(() => {
      window.location.hash = '#/audio';
    });
    await expect(page.locator('[role="slider"]').first()).toBeVisible({ timeout: 15_000 });

    const readSlider = () =>
      page.evaluate(() => document.querySelector('[role="slider"]')?.className ?? '');

    // Domyślnie fala (tak jak przed zmianą).
    await expect.poll(readSlider).toContain('h-9');

    const pickVariant = async (name: string) => {
      await page.getByTestId('audio-layout-editor').click();
      await page.getByRole('button', { name: 'Elementy' }).click();
      await page.getByRole('button', { name: 'Postęp' }).first().click();
      await page.getByRole('button', { name: 'Wariant' }).click();
      await page.getByRole('button', { name }).click();
      await page.getByRole('button', { name: 'Gotowe' }).click();
    };

    await pickVariant('Neon');
    await expect.poll(readSlider).toContain('h-1.5');
    console.log('NEON', await readSlider());

    await pickVariant('Bez tła');
    await expect
      .poll(async () => {
        const cls = await readSlider();
        return cls.includes('bg-base-content/20') || cls.includes('bg-base-content/15');
      })
      .toBe(false);
    console.log('BARE', await readSlider());

    await pickVariant('Klasyk');
    await expect.poll(readSlider).toContain('bg-base-content/20');
    console.log('CLASSIC', await readSlider());
  } finally {
    await onda.dispose();
    rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
});
