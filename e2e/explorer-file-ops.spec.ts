import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';

// Explorer file operations against a real temporary directory: new folder
// (prompt), rename, delete to Trash (default) and duplicate detection.

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
  await page.evaluate(async (path) => {
    const api = (window as unknown as { api: OndaTestApi }).api;
    await api.invoke('explorer:sendTabToMain', path);
  }, dir);
  await page.evaluate(() => {
    window.location.hash = '#/explorer';
  });
  await expect(page.getByTestId('explorer-view')).toBeVisible();
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
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await openExplorerAt(page, dir);
      await expect(page.getByTestId('explorer-item-notes.txt')).toBeVisible();

      // Deleting uses the OS Trash by default.
      const defaultDelete = await page.evaluate(async () => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        const settings = (await api.invoke('settings:get')) as {
          explorer?: { permanentDelete?: boolean };
        };
        return settings.explorer?.permanentDelete;
      });
      expect(defaultDelete ?? false).toBe(false);

      // New folder via the prompt.
      await page.getByTestId('explorer-new-folder').click();
      const prompt = page.getByTestId('explorer-prompt-dialog');
      await expect(prompt).toBeVisible();
      await prompt.locator('input[type="text"]').fill('NewDir');
      await confirmDialog(page);
      await expect(page.getByTestId('explorer-item-NewDir')).toBeVisible();
      expect(existsSync(join(dir, 'NewDir'))).toBe(true);

      // Rename via the item context menu.
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

      // Delete to Trash via the context menu.
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

      // Duplicate scan finds the copy and can delete it.
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
