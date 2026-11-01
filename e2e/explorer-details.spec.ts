import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';

// Panel szczegółów pokazuje pojedyncze zaznaczenie obok listy plików. Test pilnuje
// trzech stanów: brak zaznaczenia, plik (typ/rozmiar/ścieżka) i folder (zawartość
// liczona w main), a także zamykania Escape.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

function createFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'onda-details-'));
  writeFileSync(join(dir, 'track.mp3'), 'not-really-audio');
  mkdirSync(join(dir, 'Album'));
  writeFileSync(join(dir, 'Album', 'inner.mp3'), 'inner');
  return dir;
}

async function openExplorerAt(page: Page, dir: string): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/explorer';
  });
  await expect(page.getByTestId('explorer-view')).toBeVisible();
  await page.evaluate(async (path) => {
    const api = (window as unknown as { api: OndaTestApi }).api;
    await api.invoke('explorer:sendTabToMain', path);
  }, dir);
  await expect(page.getByTestId('explorer-item-track.mp3')).toBeVisible();
}

test.describe('explorer details pane', () => {
  let dir = '';

  test.beforeEach(() => {
    dir = createFixture();
  });

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('shows the selected file, folder contents and closes with Escape', async () => {
    // macOS runner: proces Electron kończy się SIGTRAP-em w testach eksploratora
    // (ten sam crash co w `explorer-file-ops.spec.ts`), niezależnie od asercji.
    test.skip(process.platform === 'darwin', 'macOS runner: Electron exits (SIGTRAP)');

    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await openExplorerAt(page, dir);

      const pane = page.getByTestId('explorer-details');
      await expect(pane).toHaveCount(0);

      await page.getByTestId('explorer-details-toggle').click();
      await expect(pane).toBeVisible();
      await expect(pane).toContainText('Zaznacz plik lub folder');

      await page.getByTestId('explorer-item-track.mp3').click();
      await expect(pane).toContainText('track.mp3');
      await expect(pane).toContainText('mp3');
      await expect(pane).toContainText(dir);

      await page.getByTestId('explorer-item-Album').click();
      await expect(pane).toContainText('Album');
      await expect(pane).toContainText('Folder');
      await expect(pane).toContainText('Zawartość');

      await page.keyboard.press('Escape');
      await expect(pane).toHaveCount(0);
    } finally {
      await onda.dispose();
    }
  });
});
