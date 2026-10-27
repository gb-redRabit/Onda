import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { useLibraryLoad } from '../library-load';

vi.mock('@renderer/i18n', () => ({ i18n: { global: { t: (key: string) => key } } }));

function makeCtx() {
  return {
    tracks: ref([]),
    folders: ref([]),
    folderTypes: ref({}),
    playlists: ref([]),
    isLoaded: ref(false),
    isLoading: ref(false),
    isScanning: ref(false),
    scanProgress: ref({ current: 0, total: 0 }),
    loadError: ref<string | null>(null)
  };
}

describe('useLibraryLoad error state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('records a failed chunk load in loadError and still marks the library loaded', async () => {
    vi.stubGlobal('window', {
      api: {
        invoke: vi.fn(async (channel: string) => {
          if (channel === 'library:loadScannedChunk') throw new Error('chunk boom');
          return undefined;
        })
      }
    });

    const ctx = makeCtx();
    const load = useLibraryLoad(ctx);
    const promise = load.loadFromDisk({ audioOnly: true });
    await vi.runAllTimersAsync();
    await promise;

    expect(ctx.loadError.value).toBe('chunk boom');
    expect(ctx.isLoaded.value).toBe(true);
    expect(ctx.isLoading.value).toBe(false);
  });

  it('clears an earlier error when a retry starts', async () => {
    let fail = true;
    vi.stubGlobal('window', {
      api: {
        invoke: vi.fn(async (channel: string) => {
          if (channel === 'library:loadScannedChunk') {
            if (fail) throw new Error('chunk boom');
            return { files: [], total: 0, folderTypes: {} };
          }
          return undefined;
        })
      }
    });

    const ctx = makeCtx();
    const load = useLibraryLoad(ctx);
    const first = load.loadFromDisk({ audioOnly: true });
    await vi.runAllTimersAsync();
    await first;
    expect(ctx.loadError.value).toBe('chunk boom');

    fail = false;
    const second = load.loadFromDisk({ audioOnly: true });
    await vi.runAllTimersAsync();
    await second;
    expect(ctx.loadError.value).toBeNull();
  });
});
