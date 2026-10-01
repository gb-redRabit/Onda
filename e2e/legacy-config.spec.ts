import { test, expect } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';
import { encryptLegacyConfig, legacyStoreKey } from './helpers/legacy-store';

test.describe('legacy profile migration', () => {
  const profileDir = mkdtempSync(join(tmpdir(), 'onda-legacy-'));

  test.afterAll(() => {
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('re-encrypts a hostname-keyed config and migrates the old PiP model at boot', async () => {
    // Profil przed migracją: config.json zaszyfrowany kluczem ze starej nazwy hosta,
    // oraz jeszcze brak pliku onda-store-key.
    const legacySettings = {
      appearance: {
        accentColor: '#ff8800',
        audioPipMode: 'wide',
        audioPipEdgePosition: 'top'
      }
    };
    writeFileSync(
      join(profileDir, 'config.json'),
      encryptLegacyConfig(JSON.stringify(legacySettings), legacyStoreKey())
    );
    expect(existsSync(join(profileDir, 'onda-store-key'))).toBe(false);

    const onda = await launchOnda({ userDataDir: profileDir });
    try {
      await expect(onda.page.getByTestId('app-root')).toBeVisible();
      await dismissWizard(onda.page);

      const settings = await onda.page.evaluate(async () => {
        const api = (
          window as unknown as {
            api: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> };
          }
        ).api;
        return (await api.invoke('settings:get')) as { appearance?: Record<string, unknown> };
      });

      const appearance = settings.appearance ?? {};
      expect(appearance.audioPipDock).toBe('top');
      expect(appearance.audioPipAutoHide).toBe(true);
      expect((appearance.customColors as Record<string, unknown>)?.primary).toBe('#ff8800');

      // Klucz magazynu został odtworzony, a konfiguracja ponownie nim zaszyfrowana.
      const key = readFileSync(join(profileDir, 'onda-store-key'), 'utf-8').trim();
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      const config = readFileSync(join(profileDir, 'config.json'));
      expect(config[0]).not.toBe(0x7b);
      expect(config[16]).toBe(':'.charCodeAt(0));

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
