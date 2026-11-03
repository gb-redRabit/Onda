import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createMediaFixture } from './helpers/media';
import { launchOnda, dismissWizard } from './helpers/app';

test('favorite and technical elements render and can be edited', async () => {
  const media = createMediaFixture(8);
  const profile = mkdtempSync(join(tmpdir(), 'onda-elements-'));
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

    // Ulubione: klik przełącza stan i jest widoczny w atrybucie dla czytników.
    const favorite = page.getByTestId('audio-favorite').getByRole('button');
    await expect(favorite).toHaveAttribute('aria-pressed', 'false');
    await favorite.click();
    await expect(favorite).toHaveAttribute('aria-pressed', 'true');

    // Informacje techniczne: dane z metadanych WAV (format + sample rate).
    const technical = page.getByTestId('audio-technical');
    await expect(technical).toBeVisible();
    await expect(technical).toContainText('WAV');
    await expect(technical).toContainText('kHz');

    // Oba elementy są na liście edytora i mają własne warianty.
    await page.getByTestId('audio-layout-editor').click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Ulubione' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Informacje techniczne' }).click();
    await dialog.getByRole('button', { name: 'Wariant' }).click();
    await expect(dialog.getByRole('button', { name: 'Znaczniki' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'W jednej linii' })).toBeVisible();
  } finally {
    await onda.dispose();
    rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
});
