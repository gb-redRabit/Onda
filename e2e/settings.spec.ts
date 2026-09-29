import { test, expect } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Interaction coverage for the Settings shell: rail navigation, settings search,
// the overflow menu and the reset confirmation. Destructive actions (import /
// factory reset) are never confirmed here — only their wiring is verified.

test.describe('settings interactions', () => {
  test('navigates the rail, searches settings and opens the reset confirmation', async () => {
    const onda = await launchOnda();
    try {
      await dismissWizard(onda.page);
      await onda.page.evaluate(() => {
        window.location.hash = '#/settings';
      });
      await expect(onda.page.locator('main[data-route]')).toHaveAttribute('data-route', 'settings');

      // Rail: a section jumps to its first tab.
      await onda.page.getByTestId('settings-section-appearance').click();
      await onda.page.waitForFunction(() => window.location.hash.includes('tab=theme'));
      await expect(onda.page.getByTestId('settings-tab-theme')).toHaveAttribute(
        'aria-current',
        'page'
      );

      // A specific tab can be selected directly.
      await onda.page.getByTestId('settings-section-playback').click();
      await onda.page.waitForFunction(() => window.location.hash.includes('tab=playback'));

      // Search narrows to hits and Enter opens the first hit. The query is
      // derived from a visible tab label so the test is locale-independent.
      await onda.page.getByTestId('settings-section-advanced').click();
      const pluginsTab = onda.page.getByTestId('settings-tab-plugins');
      const tabLabel = (await pluginsTab.innerText()).trim();
      const query = tabLabel.split(/\s+/)[0];

      const search = onda.page.getByTestId('settings-search');
      await search.click();
      await search.fill(query);
      await expect(onda.page.getByTestId('settings-search-hit').first()).toBeVisible();
      await search.press('Enter');
      await onda.page.waitForFunction(() => window.location.hash.includes('tab='));
      await expect(onda.page.getByTestId('settings-search-hit')).toHaveCount(0);

      // The overflow menu exposes export / import / reset without running them.
      await onda.page.getByTestId('settings-more').click();
      await expect(onda.page.getByTestId('settings-menu')).toBeVisible();
      await expect(onda.page.getByTestId('settings-export')).toBeVisible();
      await expect(onda.page.getByTestId('settings-import')).toBeVisible();
      await expect(onda.page.getByTestId('settings-reset-menu')).toBeVisible();
      await onda.page.getByTestId('settings-more').click();
      await expect(onda.page.getByTestId('settings-menu')).toHaveCount(0);

      // Reset asks for confirmation and cancelling keeps the app alive.
      await onda.page.getByTestId('settings-reset').click();
      const confirmDialog = onda.page.getByTestId('explorer-prompt-dialog');
      await expect(confirmDialog).toBeVisible();
      await confirmDialog.getByRole('button', { name: /cancel|anuluj/i }).click();
      await expect(confirmDialog).toHaveCount(0);
      await expect(onda.page.locator('main[data-route]')).toHaveAttribute('data-route', 'settings');

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
