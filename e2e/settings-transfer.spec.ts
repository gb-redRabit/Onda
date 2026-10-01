import { test, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';

// Eksport/import ustawień w obie strony przez prawdziwe handlery IPC. Natywne
// dialogi zapisu/otwarcia są zaślepione w procesie głównym, więc przepływ jest
// deterministyczny i żaden systemowy selektor nie jest pokazywany.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

test.describe('settings export/import', () => {
  const dir = mkdtempSync(join(tmpdir(), 'onda-settings-'));
  const exportPath = join(dir, 'onda-settings.json');

  test.afterAll(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('exports to disk and imports it back without a native dialog', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);

      // Skieruj oba natywne selektory na plik jednorazowy.
      await onda.app.evaluate(({ dialog }, filePath) => {
        const d = dialog as unknown as {
          showSaveDialog: () => Promise<{ canceled: boolean; filePath: string }>;
          showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
        };
        d.showSaveDialog = async () => ({ canceled: false, filePath });
        d.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      }, exportPath);

      const result = await page.evaluate(async (path) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        const setOn = await api.invoke('settings:set', { explorer: { permanentDelete: true } });
        const exported = await api.invoke('settings:export');
        // Odejdź od wyeksportowanej wartości, aby import miał co przywrócić.
        await api.invoke('settings:set', { explorer: { permanentDelete: false } });
        const exportedFile = path;
        const beforeImport = (await api.invoke('settings:get')) as {
          explorer?: { permanentDelete?: boolean };
        };
        const imported = (await api.invoke('settings:import')) as {
          success: boolean;
          data?: { explorer?: { permanentDelete?: boolean } };
        };
        const afterImport = (await api.invoke('settings:get')) as {
          explorer?: { permanentDelete?: boolean };
        };
        return { setOn, exported, exportedFile, beforeImport, imported, afterImport };
      }, exportPath);

      expect(result.setOn).toBe(true);
      expect(result.exported).toMatchObject({ success: true });
      expect(result.beforeImport.explorer?.permanentDelete).toBe(false);
      expect(result.imported.success).toBe(true);
      expect(result.imported.data?.explorer?.permanentDelete).toBe(true);
      expect(result.afterImport.explorer?.permanentDelete).toBe(true);

      // Zapisany plik to oczyszczony obiekt ustawień i nigdy nie zawiera sekretów.
      const raw = JSON.parse(readFileSync(exportPath, 'utf-8')) as {
        explorer?: { permanentDelete?: boolean };
        apiKeys?: unknown;
      };
      expect(raw.explorer?.permanentDelete).toBe(true);
      expect(raw.apiKeys).toBeUndefined();

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
