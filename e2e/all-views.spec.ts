import { test, expect, type Page } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Pokrycie każdego głównego widoku i jego kluczowych elementów (kontynuacja audytu).
// Jedno uruchomienie na grupę testów utrzymuje zestaw szybkim, jednocześnie weryfikując prawdziwy
// DOM każdego widoku: element główny, paski narzędzi, zakładki/kontrolki segmentowe i
// stany puste, które pokazuje świeży profil.

async function setHash(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    window.location.hash = `#${h}`;
  }, hash);
}

async function gotoView(page: Page, hash: string, route: string): Promise<void> {
  await setHash(page, hash);
  await expect(page.locator('main[data-route]')).toHaveAttribute('data-route', route);
}

test.describe('all views — structure', () => {
  test('every primary view mounts its root element', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);

      const views: Array<[path: string, route: string, rootTestId: string | null]> = [
        ['/', 'home', 'home-view'],
        ['/library', 'library', 'library-view'],
        ['/explorer', 'explorer', 'explorer-view'],
        ['/online', 'online', 'online-view'],
        ['/webcast', 'webcast', 'webcast-view'],
        ['/downloads', 'downloads', 'downloads-view'],
        ['/sources', 'sources', 'sources-view'],
        ['/settings', 'settings', 'settings-view'],
        ['/audio', 'audio', 'audio-view'],
        ['/explorer/window/e2e', 'explorer-window', null]
      ];

      for (const [path, route, rootTestId] of views) {
        await gotoView(page, path, route);
        await expect(page.getByTestId('app-root')).toBeVisible();
        if (rootTestId) {
          await expect(page.getByTestId(rootTestId)).toBeVisible({ timeout: 15_000 });
        }
      }

      // `/player` nie ma utworu na świeżym profilu, więc PlayerView przekierowuje do domu.
      await setHash(page, '/player');
      await expect(page.locator('main[data-route]')).toHaveAttribute('data-route', 'home');

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('Home and Library expose their controls and every tab', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);

      // ---- Home -------------------------------------------------------------
      await gotoView(page, '/', 'home');
      await expect(page.getByTestId('home-view')).toBeVisible();
      for (const id of ['open-file', 'open-folder', 'library', 'online']) {
        await expect(page.getByTestId(`home-action-${id}`)).toBeVisible();
      }
      // Liczniki renderują się, gdy (pusta) biblioteka zostanie załadowana.
      await expect(page.getByTestId('home-counter-overview')).toBeVisible({ timeout: 15_000 });
      for (const tab of ['tracks', 'video', 'images', 'playlists']) {
        await expect(page.getByTestId(`home-counter-${tab}`)).toBeVisible();
      }

      // ---- Library: każda zakładka wybiera się i utrzymuje widok zamontowany ------------
      await gotoView(page, '/library', 'library');
      await expect(page.getByTestId('library-view')).toBeVisible();
      const libraryTabs = [
        'overview',
        'tracks',
        'video',
        'images',
        'folders',
        'artists',
        'albums',
        'playlists'
      ];
      for (const id of libraryTabs) {
        const tab = page.getByTestId(`library-tab-${id}`);
        await expect(tab).toBeVisible();
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByTestId('library-view')).toBeVisible();
      }

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('Explorer exposes toolbar, search, view modes and rows', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await gotoView(page, '/explorer', 'explorer');

      await expect(page.getByTestId('explorer-view')).toBeVisible();
      const search = page.getByTestId('explorer-search');
      const viewMode = page.getByTestId('explorer-view-mode');
      await expect(search).toBeVisible();
      await expect(viewMode).toBeVisible();

      const items = page.locator('[data-testid^="explorer-item-"]');
      await expect.poll(() => items.count(), { timeout: 15_000 }).toBeGreaterThan(0);

      // Filtrowanie opróżnia listę, a wyczyszczenie ją przywraca.
      await search.fill('zzz-onda-e2e-no-such-file');
      await expect.poll(() => items.count()).toBe(0);
      await search.fill('');
      await expect.poll(() => items.count()).toBeGreaterThan(0);

      // Oba wpisy trybu widoku istnieją i zamykają listę rozwijaną.
      await viewMode.click();
      await expect(page.getByTestId('explorer-view-details')).toBeVisible();
      await page.getByTestId('explorer-view-details').click();
      await expect(viewMode).toHaveAttribute('aria-expanded', 'false');
      await viewMode.click();
      await expect(page.getByTestId('explorer-view-small')).toBeVisible();
      await page.getByTestId('explorer-view-small').click();
      await expect(viewMode).toHaveAttribute('aria-expanded', 'false');

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('Online and Webcast expose their search bar and segmented tabs', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);

      await gotoView(page, '/online', 'online');
      await expect(page.getByTestId('online-view')).toBeVisible();
      await expect(page.getByTestId('online-search-input')).toBeVisible();
      const discover = page.getByTestId('online-tab-discover');
      const subscriptions = page.getByTestId('online-tab-subscriptions');
      await expect(discover).toHaveAttribute('aria-selected', 'true');
      await subscriptions.click();
      await expect(subscriptions).toHaveAttribute('aria-selected', 'true');
      await expect(discover).toHaveAttribute('aria-selected', 'false');
      await discover.click();
      await expect(discover).toHaveAttribute('aria-selected', 'true');

      await gotoView(page, '/webcast', 'webcast');
      await expect(page.getByTestId('webcast-view')).toBeVisible();
      const savedTab = page.getByTestId('webcast-tab-saved');
      const radioTab = page.getByTestId('webcast-tab-radio');
      await expect(savedTab).toBeVisible();
      await expect(radioTab).toBeVisible();
      await radioTab.click();
      await expect(radioTab).toHaveAttribute('aria-selected', 'true');
      await savedTab.click();
      await expect(savedTab).toHaveAttribute('aria-selected', 'true');

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('Downloads and Sources expose their primary controls', async () => {
    // ONDA_E2E_FIXTURES utrzymuje kanały online/download deterministycznymi.
    const onda = await launchOnda({ env: { ONDA_E2E_FIXTURES: '1' } });
    const { page } = onda;
    try {
      await dismissWizard(page);

      await gotoView(page, '/downloads', 'downloads');
      await expect(page.getByTestId('downloads-view')).toBeVisible();
      const all = page.getByTestId('downloads-filter-all');
      const completed = page.getByTestId('downloads-filter-completed');
      await expect(all).toBeVisible();
      await expect(completed).toBeVisible();
      await expect(all).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('downloads-empty')).toBeVisible();

      await completed.click();
      await expect(completed).toHaveAttribute('aria-pressed', 'true');
      await expect(all).toHaveAttribute('aria-pressed', 'false');
      await all.click();
      await expect(all).toHaveAttribute('aria-pressed', 'true');

      await gotoView(page, '/sources', 'sources');
      await expect(page.getByTestId('sources-view')).toBeVisible();
      await expect(page.getByTestId('sources-empty-add')).toBeVisible();
      await expect(page.getByTestId('sources-add')).toBeVisible();

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('Settings expose the rail, overview, every section and the actions menu', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await gotoView(page, '/settings', 'settings');
      await expect(page.getByTestId('settings-view')).toBeVisible();

      // Pole wyszukiwania + menu akcji ⋯.
      await expect(page.getByTestId('settings-search')).toBeVisible();
      await expect(page.getByTestId('settings-overview')).toBeVisible();
      await page.getByTestId('settings-more').click();
      await expect(page.getByTestId('settings-menu')).toBeVisible();
      await expect(page.getByTestId('settings-export')).toBeVisible();
      await expect(page.getByTestId('settings-import')).toBeVisible();
      await expect(page.getByTestId('settings-reset-menu')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('settings-menu')).toHaveCount(0);

      // Rail: każda sekcja i jej zakładki (układ lg je pokazuje).
      for (const id of [
        'appearance',
        'playback',
        'downloads',
        'library',
        'network',
        'system',
        'advanced'
      ]) {
        await expect(page.getByTestId(`settings-section-${id}`)).toBeVisible();
      }
      await expect(page.getByTestId('settings-tab-playback')).toBeVisible();
      await expect(page.getByTestId('settings-tab-diagnostics')).toBeVisible();

      // Wyszukiwanie zastępuje przegląd trafieniami; wyczyszczenie go przywraca.
      await page.getByTestId('settings-search').fill('pip');
      await expect.poll(() => page.getByTestId('settings-search-hit').count()).toBeGreaterThan(0);
      await expect(page.getByTestId('settings-overview')).toHaveCount(0);
      await page.getByTestId('settings-search').fill('');
      await expect(page.getByTestId('settings-overview')).toBeVisible();

      // Przegląd eksponuje kartę na zakładkę; otwarcie jednej opuszcza przegląd.
      for (const id of ['playback', 'pip-video', 'theme', 'general', 'plugins']) {
        await expect(page.getByTestId(`settings-overview-${id}`)).toBeVisible();
      }
      await page.getByTestId('settings-overview-pip-video').click();
      await expect(page.getByTestId('settings-overview')).toHaveCount(0);
      await page.getByTestId('settings-tab-playback').click();
      await expect(page.getByTestId('settings-overview')).toHaveCount(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
