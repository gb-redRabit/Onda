import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import NodeID3 from 'node-id3';
import { launchOnda, dismissWizard } from './helpers/app';

const iconPath = resolve(__dirname, '..', 'resources', 'icon.png');

interface OndaTestApi {
  tagEditorRead: (paths: string[]) => Promise<Array<{ tags: Record<string, string> }>>;
  readCover: (path: string) => Promise<{ mime?: string; data?: number[] } | null>;
}

test.describe('tag editor tool', () => {
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
    if (dir) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  test('edits tags and applies a cover for preloaded files', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      const [editor] = await Promise.all([
        onda.app.waitForEvent('window'),
        page.evaluate(
          (paths) => {
            const api = (
              window as unknown as {
                api: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> };
              }
            ).api;
            return api.invoke('tools:openWindow', 'tag-editor', { paths });
          },
          [seedPath]
        )
      ]);
      editor.on('pageerror', (error) => onda.pageErrors.push(error.message));
      await dismissWizard(editor);
      await expect(editor.getByTestId('tools-tag-editor-view')).toBeVisible();

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

      // Batch okładki: ustaw obraz dla zaznaczonego pliku.
      await editor.getByTestId('tools-tag-cover-path').fill(iconPath);
      await editor.getByTestId('tools-tag-cover-apply').click();
      await expect
        .poll(
          async () => {
            const cover = await page.evaluate(async (path) => {
              const api = (window as unknown as { api: OndaTestApi }).api;
              return api.readCover(path);
            }, seedPath);
            return cover?.data?.length ?? 0;
          },
          { timeout: 15_000 }
        )
        .toBeGreaterThan(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
