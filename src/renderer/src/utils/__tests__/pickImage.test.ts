import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { pickImagePath } from '../pickImage';

// Trzy komponenty otwierały wybór obrazu i każdy ponownie implementował to samo
// odwijanie wyniku dialogu, więc "anulowano" i "brak ścieżki" były obsługiwane
// nieco inaczej w każdym z nich. Te przypadki są kontraktem.

type DialogResult = { canceled: boolean; filePaths: string[] } | undefined;

function stubApi(result: DialogResult | Promise<DialogResult>) {
  const open = vi.fn().mockResolvedValue(result);
  (window as unknown as { api: unknown }).api = { openImageDialog: open };
  return open;
}

describe('pickImagePath', () => {
  beforeEach(() => {
    vi.stubGlobal('window', window);
  });
  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api;
    vi.unstubAllGlobals();
  });

  it('returns the chosen path', async () => {
    stubApi({ canceled: false, filePaths: ['C:\\cover.png'] });
    expect(await pickImagePath()).toBe('C:\\cover.png');
  });

  it('takes the first path when several are returned', async () => {
    stubApi({ canceled: false, filePaths: ['a.png', 'b.png'] });
    expect(await pickImagePath()).toBe('a.png');
  });

  it('returns null when the user cancels', async () => {
    stubApi({ canceled: true, filePaths: [] });
    expect(await pickImagePath()).toBeNull();
  });

  it('returns null when no path came back', async () => {
    // Dialog zgłaszający sukces, ale niewybierający niczego, nie jest anulowaniem
    // i nie może być traktowany jako ścieżka.
    stubApi({ canceled: false, filePaths: [] });
    expect(await pickImagePath()).toBeNull();
  });

  it('returns null when the preload bridge is missing', async () => {
    // Renderer można uruchomić bez bridge (testy, strona dev); opcjonalny
    // łańcuch nie może rzucać wyjątku.
    (window as unknown as { api?: unknown }).api = undefined;
    expect(await pickImagePath()).toBeNull();
  });
});
