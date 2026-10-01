import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';

// Operacje na plikach w eksploratorze na prawdziwym katalogu tymczasowym: nowy folder
// (prompt), zmiana nazwy, usunięcie do kosza (domyślnie) i wykrywanie duplikatów.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

function createFsFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'onda-fs-'));
  writeFileSync(join(dir, 'song.mp3'), 'identical-bytes');
  writeFileSync(join(dir, 'song - Copy.mp3'), 'identical-bytes');
  writeFileSync(join(dir, 'notes.txt'), 'hello');
  return dir;
}

async function openExplorerAt(page: Page, dir: string): Promise<void> {
  // Najpierw zmontuj widok eksploratora, potem wyślij zakładkę: zdarzenie
  // `explorer:add-tab` dociera do store'a, a widok montuje się już z właściwą ścieżką.
  await page.evaluate(() => {
    window.location.hash = '#/explorer';
  });
  await expect(page.getByTestId('explorer-view')).toBeVisible();
  await page.evaluate(async (path) => {
    const api = (window as unknown as { api: OndaTestApi }).api;
    await api.invoke('explorer:sendTabToMain', path);
  }, dir);
}

async function confirmDialog(page: Page): Promise<void> {
  await page.getByTestId('explorer-prompt-dialog').getByRole('button', { name: /^ok$/i }).click();
}

test.describe('explorer file operations', () => {
  const dir = createFsFixture();

  test.afterAll(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('creates, renames, trashes and de-duplicates files', async () => {
    // Na runnerze macOS proces Electron kończy się sygnałem SIGTRAP przy otwarciu
    // dialogu "nowy folder" (crash, nie asercja) — pomijamy tam, dopóki nie zbierzemy trace'a.
    test.skip(
      process.platform === 'darwin',
      'macOS runner: Electron exits (SIGTRAP) on the new-folder prompt'
    );
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await openExplorerAt(page, dir);
      await expect(page.getByTestId('explorer-item-notes.txt')).toBeVisible();

      // Usuwanie domyślnie korzysta z kosza systemowego.
      const defaultDelete = await page.evaluate(async () => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        const settings = (await api.invoke('settings:get')) as {
          explorer?: { permanentDelete?: boolean };
        };
        return settings.explorer?.permanentDelete;
      });
      expect(defaultDelete ?? false).toBe(false);

      // Nowy folder przez prompt.
      await page.getByTestId('explorer-new-folder').click();
      const prompt = page.getByTestId('explorer-prompt-dialog');
      await expect(prompt).toBeVisible();
      await prompt.locator('input[type="text"]').fill('NewDir');
      await confirmDialog(page);
      await expect(page.getByTestId('explorer-item-NewDir')).toBeVisible();
      expect(existsSync(join(dir, 'NewDir'))).toBe(true);

      // Zmiana nazwy przez menu kontekstowe elementu.
      await page.getByTestId('explorer-item-notes.txt').click({ button: 'right' });
      await expect(page.getByTestId('context-menu')).toBeVisible();
      await page
        .getByTestId('context-menu-item')
        .filter({ hasText: /rename|zmień nazwę/i })
        .click();
      await expect(prompt).toBeVisible();
      await prompt.locator('input[type="text"]').fill('renamed.txt');
      await confirmDialog(page);
      await expect(page.getByTestId('explorer-item-renamed.txt')).toBeVisible();
      await expect(page.getByTestId('explorer-item-notes.txt')).toHaveCount(0);
      expect(existsSync(join(dir, 'renamed.txt'))).toBe(true);
      expect(existsSync(join(dir, 'notes.txt'))).toBe(false);

      // Usuń do kosza przez menu kontekstowe.
      await page.getByTestId('explorer-item-renamed.txt').click({ button: 'right' });
      await expect(page.getByTestId('context-menu')).toBeVisible();
      await page
        .getByTestId('context-menu-item')
        .filter({ hasText: /delete|usuń/i })
        .click();
      await expect(prompt).toBeVisible();
      await confirmDialog(page);
      await expect(page.getByTestId('explorer-item-renamed.txt')).toHaveCount(0);
      await expect
        .poll(() => existsSync(join(dir, 'renamed.txt')), { timeout: 10_000 })
        .toBe(false);

      // Skanowanie duplikatów znajduje kopię i może ją usunąć.
      await page.getByTestId('explorer-duplicates').click();
      await expect(page.getByTestId('explorer-duplicates-panel')).toBeVisible();
      await expect(page.getByTestId('explorer-duplicate-group')).toHaveCount(1, {
        timeout: 10_000
      });
      await page.getByTestId('explorer-duplicates-select-all').click();
      await page.getByTestId('explorer-duplicates-delete').click();
      await expect(prompt).toBeVisible();
      await confirmDialog(page);
      await expect(page.getByTestId('explorer-duplicate-group')).toHaveCount(0, {
        timeout: 10_000
      });
      await expect
        .poll(() => existsSync(join(dir, 'song - Copy.mp3')), { timeout: 10_000 })
        .toBe(false);
      expect(existsSync(join(dir, 'song.mp3'))).toBe(true);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
