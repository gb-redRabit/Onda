import type { Locator, Page } from '@playwright/test';

// Symuluje upuszczenie pliku z systemu: `text/uri-list` jest tym, co renderer
// czyta w `getDroppedFilePaths`. Ścieżka jest kodowana segment po segmencie, aby
// spacje/znaki narodowe nie rozbiły URI.
export async function dropFileOn(page: Page, target: Locator, filePath: string): Promise<void> {
  const dataTransfer = await page.evaluateHandle((path) => {
    const dt = new DataTransfer();
    const uri =
      'file:///' +
      path
        .replace(/\\/g, '/')
        .split('/')
        .map((part, index) => (index === 0 ? part : encodeURIComponent(part)))
        .join('/');
    dt.setData('text/uri-list', uri);
    return dt;
  }, filePath);
  await target.dispatchEvent('drop', { dataTransfer });
}
