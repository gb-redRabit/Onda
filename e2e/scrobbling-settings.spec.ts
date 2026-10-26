import { test, expect } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Panel scrobblingu jest częścią zakładki API Keys. Test nie wykonuje żadnych
// połączeń sieciowych — sprawdza tylko, że kontrolki istnieją i są bezpiecznie
// wyłączone, dopóki usługa nie jest skonfigurowana.
test.describe('scrobbling settings', () => {
  test('exposes Last.fm and ListenBrainz fields', async () => {
    const onda = await launchOnda();
    try {
      await dismissWizard(onda.page);
      await onda.page.evaluate(() => {
        window.location.hash = '#/settings?tab=apiKeys';
      });
      await expect(onda.page.locator('main[data-route]')).toHaveAttribute('data-route', 'settings');

      const panel = onda.page.getByTestId('settings-scrobbling');
      await expect(panel).toBeVisible();
      await expect(panel.getByTestId('scrobbling-lastfm-api-key')).toBeVisible();
      await expect(panel.getByTestId('scrobbling-lastfm-api-secret')).toBeVisible();
      await expect(panel.getByTestId('scrobbling-listenbrainz-token')).toBeVisible();
      await expect(panel.getByRole('switch')).toHaveCount(2);
      await expect(panel.getByRole('switch').first()).toBeDisabled();

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
