import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';
import { createMediaFixture } from './helpers/media';

// Menu kontekstowe prawego przycisku na trzech głównych powierzchniach: utworze biblioteki,
// elemencie eksploratora i odtwarzanym utworze w odtwarzaczu.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

async function seedLibrary(page: Page, dir: string): Promise<void> {
  await page.evaluate(async (folder) => {
    const api = (window as unknown as { api: OndaTestApi }).api;
    await api.invoke('library:saveFolders', [folder]);
    await api.invoke('library:scan', [folder]);
  }, dir);
  await page.waitForTimeout(1000);
  await page.evaluate(() => localStorage.setItem('onda.libraryTab', 'tracks'));
  await page.reload();
  await dismissWizard(page);
}

function menuItem(page: Page, pattern: RegExp) {
  return page.getByTestId('context-menu-item').filter({ hasText: pattern });
}

test.describe('context menu — library track', () => {
  const media = createMediaFixture();

  test.afterAll(() => {
    rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('toggles a track favourite from the library row menu', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await seedLibrary(page, media.dir);
      await page.evaluate(() => {
        window.location.hash = '#/library';
      });

      const track = page.getByTestId('library-track').first();
      await expect(track).toBeVisible();

      await track.click({ button: 'right' });
      await expect(page.getByTestId('context-menu')).toBeVisible();
      await menuItem(page, /add to favorites|dodaj do ulubionych/i).click();
      await expect(page.getByTestId('context-menu')).toHaveCount(0);

      // Ponowne otwarcie odzwierciedla nowy stan.
      await track.click({ button: 'right' });
      await expect(menuItem(page, /remove from favorites|usuń z ulubionych/i)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('context-menu')).toHaveCount(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});

test.describe('context menu — explorer item', () => {
  const dir = mkdtempSync(join(tmpdir(), 'onda-ctx-'));
  const filePath = join(dir, 'note.txt');
  writeFileSync(filePath, 'context menu');

  test.afterAll(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('copies the item path to the system clipboard', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/explorer';
      });
      await expect(page.getByTestId('explorer-view')).toBeVisible();
      await page.evaluate(async (path) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.invoke('explorer:sendTabToMain', path);
      }, dir);
      await expect(page.getByTestId('explorer-item-note.txt')).toBeVisible();

      await page.getByTestId('explorer-item-note.txt').click({ button: 'right' });
      await expect(page.getByTestId('context-menu')).toBeVisible();
      await menuItem(page, /copy path|kopiuj ścieżkę/i).click();
      await expect(page.getByTestId('context-menu')).toHaveCount(0);

      const clipboard = await onda.app.evaluate(({ clipboard }) => clipboard.readText());
      expect(clipboard).toBe(filePath);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});

test.describe('context menu — playing track', () => {
  const media = createMediaFixture();

  test.afterAll(() => {
    rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('opens the player menu over the audio surface', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await seedLibrary(page, media.dir);

      await page.evaluate(async (path) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.grantMediaAccess(path);
      }, media.wavPath);

      await page.evaluate(() => {
        window.location.hash = '#/library';
      });
      await page.getByTestId('library-track-play').first().click();
      await expect(page.locator('[data-testid="player-bar"][data-playing="true"]')).toBeVisible({
        timeout: 20_000
      });

      await page.evaluate(() => {
        window.location.hash = '#/player';
      });
      const surface = page.getByTestId('player-audio-surface');
      await expect(surface).toBeVisible();
      await surface.click({ button: 'right' });

      await expect(page.getByTestId('context-menu')).toBeVisible();
      await expect(menuItem(page, /pauz|wstrzymaj|odtwórz|play/i)).toBeVisible();

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
