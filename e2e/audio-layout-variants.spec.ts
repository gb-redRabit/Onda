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
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      window.location.hash = '#/audio';
    });
    await page.waitForTimeout(1200);

    const readSlider = () =>
      page.evaluate(() => document.querySelector('[role="slider"]')?.className ?? '');

    // Domyślnie fala (tak jak przed zmianą).
    expect(await readSlider()).toContain('h-9');

    const pickVariant = async (name: string) => {
      await page.getByTestId('audio-layout-editor').click();
      await page.getByRole('button', { name: 'Elementy' }).click();
      await page.getByRole('button', { name: 'Postęp' }).first().click();
      await page.getByRole('button', { name: 'Wariant' }).click();
      await page.getByRole('button', { name }).click();
      await page.getByRole('button', { name: 'Gotowe' }).click();
      await page.waitForTimeout(600);
    };

    await pickVariant('Neon');
    console.log('NEON', await readSlider());
    expect(await readSlider()).toContain('h-1.5');

    await pickVariant('Bez tła');
    console.log('BARE', await readSlider());
    const bare = await readSlider();
    expect(bare).not.toContain('bg-base-content/20');
    expect(bare).not.toContain('bg-base-content/15');

    await pickVariant('Klasyk');
    console.log('CLASSIC', await readSlider());
    expect(await readSlider()).toContain('bg-base-content/20');
  } finally {
    await onda.dispose();
    rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
});
