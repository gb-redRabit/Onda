import { test, expect, type ElectronApplication } from '@playwright/test';
import { dismissWizard, launchOnda } from './helpers/app';

function windowByUrl(app: ElectronApplication, fragment: string) {
  return app.evaluate(({ BrowserWindow: BW }, part) => {
    const win = BW.getAllWindows().find(
      (candidate) => !candidate.isDestroyed() && candidate.webContents.getURL().includes(part)
    );
    return win ? { visible: win.isVisible() } : null;
  }, fragment);
}

// W trybie Core-shell (pełne okno otwarte z compactu) przełączanie działa w obie
// strony bez restartu. Restart jest potrzebny tylko przy starcie klasycznego maina,
// gdzie audio należy do okna, a nie do Core.
test('switches core-shell main to compact and back without restart', async () => {
  const onda = await launchOnda({ env: { ONDA_CORE_SHELL: '1' } });

  try {
    const page = onda.page;
    await dismissWizard(page);
    await page.evaluate(() => {
      window.location.hash = '#/settings';
    });
    await page.getByTestId('settings-section-system').click();
    await page.getByTestId('settings-tab-general').click();

    const switchNow = page.getByTestId('settings-compact-switch-now');
    await expect(switchNow).toBeVisible();
    await switchNow.click();

    await expect
      .poll(() => windowByUrl(onda.app, 'compact.html'), { timeout: 20_000 })
      .toMatchObject({ visible: true });

    const compact = onda.app
      .windows()
      .find((candidate) => candidate.url().includes('compact.html'));
    expect(compact).toBeTruthy();
    await expect(compact!.getByTestId('compact-root')).toBeVisible({ timeout: 20_000 });

    // Powrót do pełnego okna jest teraz samą ikoną z opisem w tooltipie.
    await expect(compact!.getByTestId('compact-expand')).toHaveAttribute(
      'title',
      /Otwórz pełną|open full app/i
    );
    await compact!.getByTestId('compact-expand').click();

    await expect
      .poll(
        () =>
          onda.app.evaluate(({ BrowserWindow: BW }) => {
            const win = BW.getAllWindows().find(
              (candidate) =>
                !candidate.isDestroyed() && candidate.webContents.getURL().includes('index.html')
            );
            return win?.isVisible() ?? false;
          }),
        { timeout: 20_000 }
      )
      .toBe(true);

    expect(onda.pageErrors).toEqual([]);
  } finally {
    await onda.dispose();
  }
});
