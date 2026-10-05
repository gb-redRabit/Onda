import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import type { FileItem } from '@renderer/types/explorer';
import { useFileIcons } from '../useFileIcons';

// Regresja: `rememberFailedIcon` rekurencyjnie wołało samą siebie (brak
// `failedIcons.add`), więc każda nieudana ikona kończyła się przepełnieniem
// stosu i nieskończoną pętlą ponowień IPC.

function mountUseFileIcons() {
  let api: ReturnType<typeof useFileIcons> | null = null;
  const app = createApp({
    setup() {
      api = useFileIcons();
      return () => h('div');
    }
  });
  app.mount(document.createElement('div'));
  return {
    api: api as unknown as ReturnType<typeof useFileIcons>,
    unmount: () => app.unmount()
  };
}

function file(path: string): FileItem {
  return { name: path, path, isDirectory: false, size: 0, modifiedAt: 0, createdAt: 0 };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

const invoke = vi.fn(async () => null as string | null);

beforeEach(() => {
  invoke.mockClear();
  (window as unknown as { api: unknown }).api = { invoke };
});

describe('useFileIcons failed-icon handling', () => {
  it('remembers an unusable icon without recursing and does not retry it', async () => {
    const { api, unmount } = mountUseFileIcons();
    const item = file('C:/tmp/__onda_icon_test__.bin');

    // Pierwsze żądanie: invoke zwraca nieużywalną ikonę -> trafia do failedIcons.
    expect(api.extraSmallIcon(item)).toBeNull();
    await flush();

    const callsAfterFirst = invoke.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // Drugie żądanie tej samej ścieżki nie może ponownie uderzać do IPC
    // (wcześniej indefinitely, bo zbiór nigdy się nie zapełniał).
    expect(api.extraSmallIcon(item)).toBeNull();
    await flush();
    expect(invoke.mock.calls.length).toBe(callsAfterFirst);

    unmount();
  });
});
