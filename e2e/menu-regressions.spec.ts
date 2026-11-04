import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchOnda, dismissWizard } from './helpers/app';

// Regresje z audytu menu: klawiatura w menu Widok nie może nawigować po trasach,
// a menu obrazu nie może oferować odtwarzania ani kolejki.

function menuItemByLabel(page: Page, label: RegExp) {
  return page.getByTestId('context-menu-item').filter({ has: page.getByText(label) });
}

test.describe('app menu — view keyboard', () => {
  test('arrow keys move focus without navigating, Enter toggles the status bar once', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/library';
      });

      const trigger = page.locator('[data-menu-trigger="view"]');
      await trigger.click();
      await expect(page.locator('[data-menu="view"]')).toBeVisible();

      // Jedno naciśnięcie strzałki = jedna pozycja (handler nie może być podpięty dwa razy).
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('[data-menu="view"] [role="menuitem"]').first()).toBeFocused();
      const before = await page.evaluate(() => window.location.hash);
      await page.keyboard.press('ArrowDown');
      expect(await page.evaluate(() => window.location.hash)).toBe(before);
      await expect(page.locator('[data-menu="view"]')).toBeVisible();

      // Ostatnia pozycja to przełącznik paska statusu. Enter ma przełączyć go RAZ.
      await page.keyboard.press('End');
      await expect(page.locator('[data-menu="view"] [role="menuitem"]').last()).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-app-statusbar]')).toHaveCount(0);

      await page.keyboard.press('Enter');
      await expect(page.locator('[data-app-statusbar]')).toBeVisible();

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('left/right move between menus and expose existing screens', async () => {
    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await page.locator('[data-menu-trigger="view"]').click();
      await expect(page.locator('[data-menu="view"]')).toBeVisible();

      // Bez utworu menu Odtwarzanie jest ukryte, więc z Widoku w prawo trafiamy w Pomoc.
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('[data-menu="help"]')).toBeVisible();
      for (const label of ['Skróty klawiszowe', 'Zależności', 'Aktualizacje', 'Logi']) {
        await expect(page.getByRole('menuitem', { name: label })).toBeVisible();
      }

      await page.keyboard.press('ArrowLeft');
      await expect(page.locator('[data-menu="view"]')).toBeVisible();
      for (const label of ['Widok audio', 'Odtwarzacz', 'Źródła', 'Webcast']) {
        await expect(page.getByRole('menuitem', { name: label })).toBeVisible();
      }

      await page.keyboard.press('Escape');
      await expect(page.locator('[data-menu="view"]')).toHaveCount(0);
      await page.locator('[data-menu-trigger="file"]').click();
      await expect(page.getByRole('menuitem', { name: 'Zakończ' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-menu="file"]')).toHaveCount(0);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});

test.describe('context menu — image item', () => {
  const dir = mkdtempSync(join(tmpdir(), 'onda-ctx-img-'));
  const pngPath = join(dir, 'cover.png');
  writeFileSync(
    pngPath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
  );

  test.afterAll(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  });

  test('offers only "open image", not play or queue', async () => {
    // Ten sam crash Electrona na macOS co w `context-menu.spec.ts`.
    test.skip(process.platform === 'darwin', 'macOS runner: SIGTRAP on explorer context menu');

    const onda = await launchOnda();
    const { page } = onda;
    try {
      await dismissWizard(page);
      await page.evaluate(() => {
        window.location.hash = '#/explorer';
      });
      await expect(page.getByTestId('explorer-view')).toBeVisible();
      await page.evaluate(async (path) => {
        const api = (
          window as unknown as { api: { invoke: (c: string, ...a: unknown[]) => Promise<unknown> } }
        ).api;
        await api.invoke('explorer:sendTabToMain', path);
      }, dir);

      const item = page.getByTestId('explorer-item-cover.png');
      await expect(item).toBeVisible();
      await item.click({ button: 'right' });
      await expect(page.getByTestId('context-menu')).toBeVisible();

      await expect(menuItemByLabel(page, /^(otwórz obraz|open image)$/i)).toBeVisible();
      await expect(menuItemByLabel(page, /^(odtwórz|play)$/i)).toHaveCount(0);
      await expect(menuItemByLabel(page, /^(dodaj do kolejki|add to queue)$/i)).toHaveCount(0);

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('context-menu')).toHaveCount(0);
      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
