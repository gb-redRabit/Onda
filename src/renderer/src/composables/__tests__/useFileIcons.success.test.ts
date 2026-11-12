import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import type { FileItem } from '@renderer/types/explorer';

const mocks = vi.hoisted(() => ({
  cached: vi.fn((_path?: string) => null as string | null),
  setCached: vi.fn(),
  usable: vi.fn(() => true),
  loggerError: vi.fn(),
  invoke: vi.fn()
}));

vi.mock('@renderer/utils/thumbLoader', () => ({
  cachedIcon: mocks.cached,
  setCachedIcon: mocks.setCached,
  isUsableImageDataUrl: mocks.usable
}));
vi.mock('@shared/logger', () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}));

import { useFileIcons } from '../useFileIcons';

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

function file(path: string, overrides: Partial<FileItem> = {}): FileItem {
  return {
    name: path,
    path,
    isDirectory: false,
    size: 0,
    modifiedAt: 0,
    createdAt: 0,
    ...overrides
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 25));

beforeEach(() => {
  mocks.cached.mockReset().mockReturnValue(null);
  mocks.setCached.mockClear();
  mocks.usable.mockReset().mockReturnValue(true);
  mocks.loggerError.mockClear();
  mocks.invoke.mockReset().mockResolvedValue('data:image/png;base64,ICON');
  (window as unknown as { api: unknown }).api = { invoke: mocks.invoke };
});

describe('useFileIcons success path', () => {
  it('does not request icons for directories', async () => {
    const { api, unmount } = mountUseFileIcons();

    expect(api.extraSmallIcon(file('/music', { isDirectory: true }))).toBeNull();
    await flush();

    expect(mocks.invoke).not.toHaveBeenCalled();
    unmount();
  });

  it('loads, caches and publishes a usable shell icon', async () => {
    const { api, unmount } = mountUseFileIcons();

    expect(api.extraSmallIcon(file('/music/song.mp3'))).toBeNull();
    await flush();

    expect(mocks.invoke).toHaveBeenCalledWith('shell:getFileIcon', '/music/song.mp3');
    expect(mocks.setCached).toHaveBeenCalledWith('/music/song.mp3', 'data:image/png;base64,ICON');
    expect(api.extraSmallIcons.value).toEqual({
      '/music/song.mp3': 'data:image/png;base64,ICON'
    });
    unmount();
  });

  it('batches several icon results into one state update', async () => {
    const { api, unmount } = mountUseFileIcons();

    api.extraSmallIcon(file('/a.mp3'));
    api.extraSmallIcon(file('/b.mp3'));
    await flush();

    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(Object.keys(api.extraSmallIcons.value)).toEqual(['/a.mp3', '/b.mp3']);
    unmount();
  });

  it('returns a cached icon and prefers the published record', async () => {
    mocks.cached.mockImplementation((path?: string) =>
      path?.includes('cached') ? 'cached-icon' : null
    );
    const { api, unmount } = mountUseFileIcons();

    expect(api.extraSmallIcon(file('/cached.mp3'))).toBe('cached-icon');
    expect(api.extraSmallIcon(file('/fresh.mp3'))).toBeNull();
    await flush();

    expect(api.extraSmallIcons.value['/fresh.mp3']).toBe('data:image/png;base64,ICON');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('deduplicates repeated requests for the same path', async () => {
    const { api, unmount } = mountUseFileIcons();

    api.extraSmallIcon(file('/same.mp3'));
    api.extraSmallIcon(file('/same.mp3'));
    await flush();

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe('useFileIcons failure path', () => {
  it('remembers an unusable icon and never retries it', async () => {
    mocks.usable.mockReturnValue(false);
    const { api, unmount } = mountUseFileIcons();

    api.extraSmallIcon(file('/bad.mp3'));
    await flush();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    expect(api.extraSmallIcon(file('/bad.mp3'))).toBeNull();
    await flush();

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.setCached).not.toHaveBeenCalled();
    unmount();
  });

  it('logs transport failures and marks the icon as failed', async () => {
    mocks.invoke.mockRejectedValue(new Error('ipc'));
    const { api, unmount } = mountUseFileIcons();

    api.extraSmallIcon(file('/error.mp3'));
    await flush();

    expect(mocks.loggerError).toHaveBeenCalledWith('Explorer', 'getFileIcon', expect.any(Error));

    api.extraSmallIcon(file('/error.mp3'));
    await flush();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe('useFileIcons lifecycle', () => {
  it('cancels a queued pump on unmount', async () => {
    const { api, unmount } = mountUseFileIcons();

    api.extraSmallIcon(file('/queued.mp3'));
    unmount();
    await flush();

    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('cancels a pending render on unmount', async () => {
    vi.useFakeTimers();
    try {
      const { api, unmount } = mountUseFileIcons();

      api.extraSmallIcon(file('/pending.mp3'));
      await vi.advanceTimersByTimeAsync(0);

      unmount();
      vi.advanceTimersByTime(0);

      expect(api.extraSmallIcons.value).toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });
});
