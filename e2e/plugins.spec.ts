import { test, expect } from '@playwright/test';
import { rmSync } from 'fs';
import { launchOnda, dismissWizard } from './helpers/app';
import { createMediaFixture } from './helpers/media';

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  grantMediaAccess: (filePath: string) => Promise<boolean>;
}

test.describe('plugin permission review', () => {
  test('installs disabled and requires approval for the current capability set', async () => {
    const onda = await launchOnda();
    try {
      await dismissWizard(onda.page);
      const installed = await onda.page.evaluate(async () => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        return api.invoke('plugins:installExample', 'hello');
      });
      expect(installed).toMatchObject({
        success: true,
        installed: { id: 'hello', enabled: false }
      });

      await onda.page.evaluate(() => {
        window.location.hash = '#/settings?tab=plugins';
      });
      await expect(onda.page.getByTestId('plugins-refresh')).toBeVisible();
      await onda.page.getByTestId('plugins-refresh').click();
      const card = onda.page.getByTestId('plugin-card-hello');
      await expect(card).toBeVisible();

      await onda.page.getByTestId('plugins-guide-open').click();
      const guide = onda.page.getByTestId('plugins-guide-dialog');
      await expect(guide).toContainText('4096');
      await expect(guide).toContainText(/private network|sieci prywatnej/i);
      await onda.page.getByTestId('plugins-guide-close').click();

      const toggle = onda.page.getByTestId('plugin-toggle-hello');
      await toggle.click();
      const dialog = onda.page.getByTestId('plugin-permission-dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('https://httpbin.org/*');
      await expect(dialog).toContainText('app:start');
      await expect(dialog).toContainText('track:play');

      await dialog.getByRole('button', { name: /cancel|anuluj/i }).click();
      await expect(dialog).toHaveCount(0);
      const denied = await onda.page.evaluate(async () => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        return api.invoke('plugins:toggle', 'hello', true, 'not-the-current-capability-hash');
      });
      expect(denied).toBe(false);

      await toggle.click();
      await onda.page
        .getByTestId('plugin-permission-dialog')
        .getByRole('button', { name: /approve and enable|zatwierdź i włącz/i })
        .click();
      await expect(card).toContainText(/Enabled|Włączona/);
      await expect(card).toContainText(/Loaded|Załadowana/);
      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('lists the declared UI slot in the review dialog', async () => {
    const onda = await launchOnda();
    try {
      await dismissWizard(onda.page);
      const installed = await onda.page.evaluate(async () => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        return api.invoke('plugins:installExample', 'progress-slot');
      });
      expect(installed).toMatchObject({ success: true, installed: { enabled: false } });

      await onda.page.evaluate(() => {
        window.location.hash = '#/settings?tab=plugins';
      });
      await expect(onda.page.getByTestId('plugins-refresh')).toBeVisible();
      await onda.page.getByTestId('plugins-refresh').click();

      await onda.page.getByTestId('plugin-toggle-progress-slot').click();
      const dialog = onda.page.getByTestId('plugin-permission-dialog');
      await expect(dialog).toBeVisible();
      const slots = onda.page.getByTestId('plugin-permission-ui-slots');
      await expect(slots).toBeVisible();
      await expect(slots).toContainText('audio-view');
      await expect(slots).toContainText(/tekst|text/i);
      // Hook timeupdate jest również częścią przeglądanej powierzchni.
      await expect(dialog).toContainText('track:timeupdate');

      await dialog.getByRole('button', { name: /cancel|anuluj/i }).click();
      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('guide search filters sections and exposes copyable snippets', async () => {
    const onda = await launchOnda();
    try {
      await dismissWizard(onda.page);
      await onda.page.evaluate(() => {
        window.location.hash = '#/settings?tab=plugins';
      });
      await expect(onda.page.getByTestId('plugins-refresh')).toBeVisible();
      await onda.page.getByTestId('plugins-guide-open').click();

      const guide = onda.page.getByTestId('plugins-guide-dialog');
      const search = onda.page.getByTestId('plugins-guide-search');
      const count = onda.page.getByTestId('plugins-guide-count');
      const total = await count.innerText();
      expect(total).toMatch(/^(\d+) \/ \1$/);
      expect(total).not.toMatch(/^1 \//);

      // Filtrowanie zachowuje oryginalną numerację pozostałej sekcji.
      await search.fill('spectrum');
      await expect(count).not.toHaveText(total);
      await expect(guide).toContainText('player:spectrum');
      await expect(guide).not.toContainText('manifest:missing-name');

      await search.fill('zzz-no-such-topic');
      await expect(onda.page.getByTestId('plugins-guide-empty')).toBeVisible();
      await onda.page.getByTestId('plugins-guide-search-clear').click();
      await expect(count).toHaveText(total);

      // Bloki kodu można kopiować; zawodny schowek nie może zepsuć dialogu.
      await search.fill('manifest');
      const copy = onda.page.getByTestId('plugins-guide-copy').first();
      await expect(copy).toBeVisible();
      await copy.click();
      await expect(onda.page.getByTestId('plugins-guide-dialog')).toBeVisible();

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('bundled examples load as real workers without errors', async () => {
    const onda = await launchOnda();
    try {
      await dismissWizard(onda.page);
      const ids = [
        'sleep-timer',
        'auto-fade',
        'vu-meter',
        'smart-queue',
        'track-actions',
        'focus-mode',
        'listen-history',
        'note-readout',
        'metadata-lookup',
        'triangle'
      ];
      for (const id of ids) {
        const installed = await onda.page.evaluate(async (pluginId) => {
          const api = (window as unknown as { api: OndaTestApi }).api;
          return api.invoke('plugins:installExample', pluginId);
        }, id);
        expect(installed).toMatchObject({ success: true, installed: { enabled: false } });
      }

      await onda.page.evaluate(() => {
        window.location.hash = '#/settings?tab=plugins';
      });
      await expect(onda.page.getByTestId('plugins-refresh')).toBeVisible();
      await onda.page.getByTestId('plugins-refresh').click();

      for (const id of ids) {
        await onda.page.getByTestId(`plugin-toggle-${id}`).click();
        await onda.page
          .getByTestId('plugin-permission-dialog')
          .getByRole('button', { name: /approve and enable|zatwierdź i włącz/i })
          .click();
        const card = onda.page.getByTestId(`plugin-card-${id}`);
        await expect(card).toContainText(/Loaded|Załadowana/, { timeout: 15_000 });
        await expect(card).not.toContainText(/Błąd|Error/);
      }

      // sleep-timer dostarcza formularz konfiguracji (ustawienia w manifeście).
      await expect(onda.page.getByTestId('plugin-card-sleep-timer')).toContainText(
        /Konfiguracja|Configuration/
      );
      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('renders the plugin slot text in the audio view while a track plays', async () => {
    const media = createMediaFixture();
    const onda = await launchOnda();
    try {
      await dismissWizard(onda.page);
      await onda.page.evaluate(async (dir) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.invoke('library:saveFolders', [dir]);
        await api.invoke('library:scan', [dir]);
        await api.invoke('plugins:installExample', 'progress-slot');
      }, media.dir);

      // Włącz wtyczkę przez prawdziwy dialog przeglądu.
      await onda.page.evaluate(() => {
        window.location.hash = '#/settings?tab=plugins';
      });
      await expect(onda.page.getByTestId('plugins-refresh')).toBeVisible();
      await onda.page.getByTestId('plugins-refresh').click();
      await onda.page.getByTestId('plugin-toggle-progress-slot').click();
      await onda.page
        .getByTestId('plugin-permission-dialog')
        .getByRole('button', { name: /approve and enable|zatwierdź i włącz/i })
        .click();
      await expect(onda.page.getByTestId('plugin-card-progress-slot')).toContainText(
        /Loaded|Załadowana/
      );

      // Indeks biblioteki jest debounced; uruchom ponownie, aby wynik skanowania został załadowany.
      await onda.page.waitForTimeout(1000);
      await onda.page.evaluate(() => localStorage.setItem('onda.libraryTab', 'tracks'));
      await onda.page.reload();
      await expect(onda.page.getByTestId('app-root')).toBeVisible();
      await dismissWizard(onda.page);
      await onda.page.evaluate(async (path) => {
        const api = (window as unknown as { api: OndaTestApi }).api;
        await api.grantMediaAccess(path);
      }, media.wavPath);
      await onda.page.evaluate(() => {
        window.location.hash = '#/library';
      });
      await expect(onda.page.getByTestId('library-track').first()).toBeVisible();
      await onda.page.getByTestId('library-track-play').first().click();
      await onda.page.evaluate(() => {
        window.location.hash = '#/audio';
      });
      await expect(onda.page.locator('main[data-route]')).toHaveAttribute('data-route', 'audio');

      const slot = onda.page.getByTestId('plugin-slot-audio-view');
      await expect(slot).toBeVisible({ timeout: 20_000 });
      await expect(onda.page.getByTestId('plugin-slot-item-progress-slot').first()).toBeVisible();
      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
      rmSync(media.dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  });
});
