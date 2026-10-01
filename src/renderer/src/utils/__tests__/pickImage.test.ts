import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { pickImagePath } from '../pickImage';

// Three components opened the image picker and each re-implemented the same
// unwrapping of the dialog result, so "cancelled" and "no path" were handled
// slightly differently in each. These cases are the contract.

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
    // A dialog that reports success but selects nothing is not a cancel, and
    // must not be treated as a path.
    stubApi({ canceled: false, filePaths: [] });
    expect(await pickImagePath()).toBeNull();
  });

  it('returns null when the preload bridge is missing', async () => {
    // The renderer can be exercised without a bridge (tests, a dev page); the
    // optional chain must not throw.
    (window as unknown as { api?: unknown }).api = undefined;
    expect(await pickImagePath()).toBeNull();
  });
});
