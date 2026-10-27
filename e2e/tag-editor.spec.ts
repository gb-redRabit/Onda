import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import NodeID3 from 'node-id3';
import { launchOnda, dismissWizard } from './helpers/app';
import { dropFileOn } from './helpers/dragDrop';

interface OndaTestApi {
  tagEditorRead: (paths: string[]) => Promise<Array<{ tags: Record<string, string> }>>;
}

test.describe('tag editor tool', () => {
  // Istniejący helper dropu zamienia ścieżki na backslashe, więc na POSIX
  // `getDroppedFilePaths` nie odtworzy poprawnej ścieżki (wcześniejszy, osobny temat).
  test.skip(process.platform !== 'win32', 'dropped file paths are Windows-shaped');

  let dir = '';
  let seedPath = '';

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'onda-tag-editor-'));
    seedPath = join(dir, 'seed.mp3');
    writeFileSync(
      seedPath,
      NodeID3.write({ title: 'Seed title', artist: 'Old artist' }, Buffer.alloc(0))
    );
  });

  test.afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('edits and saves tags for a dropped file', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/tools';
      });
      await expect(page.getByTestId('tools-hub')).toBeVisible();
      await expect(page.getByTestId('tools-card-tag-editor')).toBeVisible();

      const [editor] = await Promise.all([
        onda.app.waitForEvent('window'),
        page.getByTestId('tools-card-tag-editor').click()
      ]);
      editor.on('pageerror', (error) => onda.pageErrors.push(error.message));
      await dismissWizard(editor);
      await expect(editor.getByTestId('tools-tag-editor-view')).toBeVisible();

      await dropFileOn(editor, editor.getByTestId('tools-tag-drop'), seedPath);
      const row = editor.locator('tbody tr').first();
      await expect(row).toContainText('seed.mp3');
      const inputs = row.locator('input[type="text"]');
      await expect(inputs.nth(0)).toHaveValue('Seed title');
      await expect(inputs.nth(1)).toHaveValue('Old artist');

      await inputs.nth(0).fill('Renamed title');
      await inputs.nth(1).fill('New artist');
      await editor.getByTestId('tools-tag-save').click();

      await expect
        .poll(
          async () => {
            const files = await page.evaluate(async (path) => {
              const api = (window as unknown as { api: OndaTestApi }).api;
              return api.tagEditorRead([path]);
            }, seedPath);
            return files[0]?.tags;
          },
          { timeout: 15_000 }
        )
        .toMatchObject({ title: 'Renamed title', artist: 'New artist' });

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
