import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createImageFixture, createLibraryFixture } from './helpers/media';
import { launchOnda, dismissWizard, type OndaApp } from './helpers/app';

// Narzędzia dostępne z menu kontekstowego Eksploratora: podmenu pokazuje tylko
// pasujące narzędzia, a ponowne otwarcie podmienia wejście w już otwartym oknie.

async function openExplorerAt(onda: OndaApp, dir: string): Promise<Page> {
  const { page } = onda;
  await page.evaluate(() => {
    window.location.hash = '#/explorer';
  });
  await expect(page.getByTestId('explorer-view')).toBeVisible();
  await page.evaluate(async (path) => {
    const api = (window as unknown as { api: { invoke: (c: string, ...a: unknown[]) => unknown } })
      .api;
    await api.invoke('explorer:sendTabToMain', path);
  }, dir);
  return page;
}

function menuItem(page: Page, label: string) {
  return page.getByTestId('context-menu-item').filter({ hasText: label });
}

function submenuItem(page: Page, label: string) {
  return page.getByTestId('context-menu-subitem').filter({ hasText: label });
}

async function openToolFromExplorer(
  onda: OndaApp,
  explorer: Page,
  fileName: string,
  toolLabel: string,
  existingTool?: Page
) {
  await expect(explorer.getByTestId(`explorer-item-${fileName}`)).toBeVisible({ timeout: 15_000 });
  await explorer.getByTestId(`explorer-item-${fileName}`).click({ button: 'right' });
  const parentItem = menuItem(explorer, 'Narzędzia');
  await parentItem.hover();
  const toolItem = submenuItem(explorer, toolLabel);
  await expect(toolItem).toBeVisible({ timeout: 10_000 });
  // Przejdź kursorem przez przerwę między menu a podmenu (jak użytkownik),
  // powoli — to łapie zbyt agresywne zamykanie podmenu.
  const parentBox = await parentItem.boundingBox();
  const box = await toolItem.boundingBox();
  if (parentBox && box) {
    const startX = parentBox.x + parentBox.width - 4;
    const startY = parentBox.y + parentBox.height / 2;
    const endX = box.x + Math.min(12, box.width / 2);
    const endY = box.y + box.height / 2;
    for (let step = 1; step <= 10; step++) {
      await explorer.mouse.move(
        startX + ((endX - startX) * step) / 10,
        startY + ((endY - startY) * step) / 10
      );
      await explorer.waitForTimeout(20);
    }
  }
  await expect(toolItem).toBeVisible();
  if (existingTool) {
    await toolItem.click();
    return existingTool;
  }
  const windowPromise = onda.app.waitForEvent('window');
  await toolItem.click();
  const tool = await windowPromise;
  await dismissWizard(tool);
  return tool;
}

test.describe('tools from the explorer context menu', () => {
  // Ten sam wzorzec co w `context-menu.spec.ts`: macOS runner kończy proces
  // Electrona (SIGTRAP) przy prawym kliknięciu elementu Eksploratora.
  test.skip(
    process.platform === 'darwin',
    'macOS runner: Electron exits (SIGTRAP) on the explorer item context menu'
  );

  test('opens image studio with the clicked image and swaps it on reopen', async () => {
    const images = createImageFixture(2);
    const profile = mkdtempSync(join(tmpdir(), 'onda-tools-menu-'));
    const onda = await launchOnda({ userDataDir: profile });
    try {
      await dismissWizard(onda.page);
      const explorer = await openExplorerAt(onda, images.dir);

      const studio = await openToolFromExplorer(onda, explorer, 'img-001.png', 'Studio obrazów');
      await expect(studio.getByTestId('image-studio-view')).toContainText('img-001.png');
      await expect(studio.getByTestId('image-studio-canvas')).toBeVisible({ timeout: 15_000 });

      // To samo narzędzie jest już otwarte — nowe zaznaczenie podmienia obraz.
      await openToolFromExplorer(onda, explorer, 'img-002.png', 'Studio obrazów', studio);
      await expect(studio.getByTestId('image-studio-view')).toContainText('img-002.png', {
        timeout: 15_000
      });

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('opens the converter with audio and replaces the list on reopen', async () => {
    const library = createLibraryFixture(2);
    const profile = mkdtempSync(join(tmpdir(), 'onda-tools-converter-'));
    const onda = await launchOnda({ userDataDir: profile });
    try {
      await dismissWizard(onda.page);
      const explorer = await openExplorerAt(onda, library.dir);

      const converter = await openToolFromExplorer(onda, explorer, 'tone-01.wav', 'Konwerter');
      await expect(converter.getByTestId('tools-converter-view')).toContainText('tone-01.wav', {
        timeout: 15_000
      });

      await openToolFromExplorer(onda, explorer, 'tone-02.wav', 'Konwerter', converter);
      await expect(converter.getByTestId('tools-converter-view')).toContainText('tone-02.wav', {
        timeout: 15_000
      });
      await expect(converter.getByTestId('tools-converter-view')).not.toContainText('tone-01.wav');

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('asks for files before opening a tool from the hub', async () => {
    const library = createLibraryFixture(1);
    const profile = mkdtempSync(join(tmpdir(), 'onda-tools-hub-picker-'));
    const onda = await launchOnda({ userDataDir: profile });
    try {
      await dismissWizard(onda.page);
      await onda.page.evaluate(() => {
        window.location.hash = '#/tools';
      });
      await expect(onda.page.getByTestId('tools-hub')).toBeVisible();

      // Karta narzędzia najpierw otwiera wybór plików; dopiero wynik otwiera okno.
      await onda.app.evaluate(({ dialog }, filePath) => {
        const d = dialog as unknown as {
          showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
        };
        d.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      }, library.wavPath);

      const [converter] = await Promise.all([
        onda.app.waitForEvent('window'),
        onda.page.getByTestId('tools-card-converter').click()
      ]);
      await dismissWizard(converter);
      await expect(converter.getByTestId('tools-converter-view')).toContainText('tone-01.wav', {
        timeout: 15_000
      });

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });

  test('offers tag editor for audio and replaces the open file list', async () => {
    const library = createLibraryFixture(2);
    const profile = mkdtempSync(join(tmpdir(), 'onda-tools-tags-'));
    const onda = await launchOnda({ userDataDir: profile });
    try {
      await dismissWizard(onda.page);
      const explorer = await openExplorerAt(onda, library.dir);

      const editor = await openToolFromExplorer(onda, explorer, 'tone-01.wav', 'Edytor tagów');
      await expect(editor.getByTestId('tools-tag-editor-view')).toContainText('tone-01.wav', {
        timeout: 15_000
      });

      await openToolFromExplorer(onda, explorer, 'tone-02.wav', 'Edytor tagów', editor);
      await expect(editor.getByTestId('tools-tag-editor-view')).toContainText('tone-02.wav', {
        timeout: 15_000
      });
      await expect(editor.getByTestId('tools-tag-editor-view')).not.toContainText('tone-01.wav');

      expect(onda.pageErrors).toEqual([]);
    } finally {
      await onda.dispose();
    }
  });
});
