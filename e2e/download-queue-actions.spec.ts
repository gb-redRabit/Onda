import { test, expect, type Locator, type Page } from '@playwright/test';
import { launchOnda, dismissWizard } from './helpers/app';

// Akcje wiersza kolejki pobierania na deterministycznych fixture'ach cyklu życia:
// zadania oczekujące pozostają w kolejce (`#hold`), zadania `#downloading` pozostają aktywne, więc
// pauza / wznowienie / anulowanie / ponowienie / wyczyszczenie ukończonych można zweryfikować bez
// wyścigu z rzeczywistymi timerami pobierania.

interface OndaTestApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

function job(title: string, fragment: string) {
  return {
    url: `https://www.youtube.com/watch?v=e2e-${fragment}${fragment ? `#${fragment}` : ''}`,
    title,
    kind: 'audio',
    format: 'best',
    quality: 'best',
    outputDir: '.',
    filenameTemplate: '%(title)s.%(ext)s'
  };
}

function row(page: Page, title: string): Locator {
  return page.getByTestId('download-row').filter({ hasText: title });
}

test.describe('download queue actions', () => {
  test('pauses, resumes, cancels, retries and deletes queued items', async () => {
    const onda = await launchOnda({ env: { ONDA_E2E_FIXTURES: '1' } });
    const { page } = onda;
    try {
      await dismissWizard(page);

      await page.evaluate(
        async (jobs) => {
          const api = (window as unknown as { api: OndaTestApi }).api;
          await api.invoke('yt:download:add', jobs);
        },
        [job('E2E Hold', 'hold'), job('E2E Live', 'downloading'), job('E2E Done', 'done')]
      );

      await page.evaluate(() => {
        window.location.hash = '#/downloads';
      });

      const rows = page.getByTestId('download-row');
      await expect(rows).toHaveCount(3);

      const hold = row(page, 'E2E Hold');
      const live = row(page, 'E2E Live');
      const done = row(page, 'E2E Done');

      // Wstrzymaj aktywne pobieranie.
      await expect(live.getByTestId('download-action-pause')).toBeVisible({ timeout: 10_000 });
      await live.getByTestId('download-action-pause').click();
      await expect(live.getByTestId('download-action-resume')).toBeVisible();

      // Wznów je z powrotem do kolejki.
      await live.getByTestId('download-action-resume').click();
      await expect(live.getByTestId('download-action-cancel')).toBeVisible();

      // Anuluj je, następnie ponów anulowany wiersz (świeże zadanie je zastępuje).
      await live.getByTestId('download-action-cancel').click();
      await expect(live.getByTestId('download-action-retry')).toBeVisible();
      await live.getByTestId('download-action-retry').click();
      await expect(live.getByTestId('download-action-retry')).toHaveCount(0);
      await expect(rows).toHaveCount(3);

      // Nieruszone zadanie osiąga ukończenie, następnie clear-finished usuwa je.
      await expect(done.getByTestId('download-action-play')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('downloads-clear-finished').click();
      await expect(done).toHaveCount(0);
      await expect(rows).toHaveCount(2);

      // Anuluj + ponów wciąż oczekujące zadanie.
      await hold.getByTestId('download-action-cancel').click();
      await expect(hold.getByTestId('download-action-retry')).toBeVisible();
      await hold.getByTestId('download-action-retry').click();
      await expect(hold.getByTestId('download-action-retry')).toHaveCount(0);
      await expect(rows).toHaveCount(2);

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
