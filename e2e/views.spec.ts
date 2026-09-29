import { test, expect } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

test.describe('main view navigation', () => {
  test('mounts every primary route without renderer errors', async () => {
    const onda = await launchOnda();
    try {
      await dismissWizard(onda.page);
      const routes = [
        ['home', '/'],
        ['library', '/library'],
        ['explorer', '/explorer'],
        ['online', '/online'],
        ['webcast', '/webcast'],
        ['downloads', '/downloads'],
        ['sources', '/sources'],
        ['settings', '/settings'],
        ['audio', '/audio'],
        ['explorer-window', '/explorer/window/e2e']
      ] as const;

      for (const [routeName, path] of routes) {
        await onda.page.evaluate((nextPath) => {
          window.location.hash = `#${nextPath}`;
        }, path);
        await expect(onda.page.locator('main[data-route]')).toHaveAttribute(
          'data-route',
          routeName
        );
        await expect(onda.page.getByTestId('app-root')).toBeVisible();
      }

      for (const width of [900, 1200]) {
        await onda.page.setViewportSize({ width, height: 600 });
        await onda.page.evaluate(() => {
          window.location.hash = '#/settings';
        });
        await expect(onda.page.locator('main[data-route]')).toHaveAttribute(
          'data-route',
          'settings'
        );
        await expect(onda.page.locator('main[data-route]')).toBeVisible();
      }

      await onda.page.evaluate(() => {
        window.location.hash = '#/settings?tab=systemInfo';
      });
      await onda.page.waitForFunction(() => window.location.hash.includes('tab=diagnostics'));

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('opens and closes the detached image viewer window', async () => {
    const onda = await launchOnda();
    try {
      await dismissWizard(onda.page);
      const viewerWindow = onda.app.waitForEvent('window');
      await onda.page.evaluate(async () => {
        const api = (
          window as unknown as {
            api?: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> };
          }
        ).api;
        await api?.invoke(
          'imageViewer:open',
          [
            {
              name: 'missing.png',
              path: 'C:\\onda-e2e\\missing.png',
              isDirectory: false,
              size: 1,
              modifiedAt: 0,
              createdAt: 0,
              extension: 'png',
              mimeType: 'image/png'
            }
          ],
          0
        );
      });
      const viewer = await viewerWindow;
      await expect(viewer.locator('main[data-route]')).toHaveAttribute(
        'data-route',
        'image-viewer'
      );
      const closed = viewer.waitForEvent('close');
      await viewer.evaluate(() => {
        const api = (
          window as unknown as {
            api?: { invoke: (channel: string) => Promise<unknown> };
          }
        ).api;
        return api?.invoke('imageViewer:close');
      });
      await closed;
    } finally {
      await onda.dispose();
    }
  });

  test('PiP video preview uses the actual PiP renderer and reports close state', async () => {
    const onda = await launchOnda();
    try {
      await dismissWizard(onda.page);
      await onda.page.evaluate(() => {
        window.location.hash = '#/settings?tab=pip-video';
      });
      await expect(onda.page.locator('main[data-route]')).toHaveAttribute('data-route', 'settings');
      const toggle = onda.page.getByTestId('pip-video-preview-toggle');
      const previewWindow = onda.app.waitForEvent('window');
      await toggle.click();
      const preview = await previewWindow;

      await expect(preview.getByTestId('pip-video-preview')).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      const closed = preview.waitForEvent('close');
      await preview.getByTestId('pip-video-preview-close').click();
      await closed;
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await onda.dispose();
    }
  });
});
