import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  library: { normalizedFolders: new Set<string>() },
  invoke: vi.fn()
}));

vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => h.library }));

import { getRendererBootMetrics, markRendererReady } from '../bootMetrics';
import { isLibraryFolder } from '../libraryFolders';
import {
  copyPathToClipboard,
  copyPathViaMain,
  openInTerminal,
  openWithDefaultApp,
  revealInFolder
} from '../menuActions';
import { notifyNative } from '../notifications';
import { pickFolder } from '../pickFolder';
import { providerLabel } from '../providerLabels';
import { BASE_TOKENS, BRAND_TOKENS, PREVIEW_TOKENS, STATUS_TOKENS } from '../themeTokens';

const api = window as unknown as { api?: { invoke: typeof h.invoke } };

beforeEach(() => {
  h.library.normalizedFolders = new Set(['D:/Music', 'E:/Videos']);
  h.invoke.mockReset().mockResolvedValue(undefined);
  api.api = { invoke: h.invoke };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('isLibraryFolder', () => {
  it('matches normalized folders and trims a trailing separator', () => {
    expect(isLibraryFolder('D:/Music')).toBe(true);
    expect(isLibraryFolder('D:/Music/')).toBe(true);
    expect(isLibraryFolder('E:\\Videos\\')).toBe(false);
  });
});

describe('providerLabel', () => {
  it('translates known providers', () => {
    const t = (key: string) => (key === 'providers.name.pikpak' ? 'PikPak' : key);

    expect(providerLabel('pikpak', 'raw', t)).toBe('PikPak');
  });

  it('falls back to the raw label without a translation', () => {
    const t = (key: string) => key;

    expect(providerLabel('pikpak', 'Raw Label', t)).toBe('Raw Label');
  });
});

describe('pickFolder', () => {
  it('returns the first selected folder', async () => {
    h.invoke.mockResolvedValue(['D:/Picked']);

    await expect(pickFolder()).resolves.toBe('D:/Picked');
    expect(h.invoke).toHaveBeenCalledWith('dialog:openFolder');
  });

  it('returns null for cancellation and empty paths', async () => {
    h.invoke.mockResolvedValueOnce(undefined);
    await expect(pickFolder()).resolves.toBeNull();

    h.invoke.mockResolvedValueOnce([]);
    await expect(pickFolder()).resolves.toBeNull();

    h.invoke.mockResolvedValueOnce(['']);
    await expect(pickFolder()).resolves.toBeNull();
  });

  it('tolerates a missing preload api', async () => {
    api.api = undefined;

    await expect(pickFolder()).resolves.toBeNull();
  });
});

describe('bootMetrics', () => {
  let entries: unknown[] = [];

  beforeEach(() => {
    entries = [];
    Object.defineProperty(performance, 'getEntriesByType', {
      configurable: true,
      value: vi.fn(() => entries)
    });
  });

  it('starts without a renderer-ready mark', () => {
    expect(getRendererBootMetrics().rendererReadyMs).toBeNull();
  });

  it('records a rounded renderer-ready time', () => {
    vi.spyOn(performance, 'now').mockReturnValue(123.7);

    markRendererReady();

    expect(getRendererBootMetrics().rendererReadyMs).toBe(124);
  });

  it('reads navigation timings when available', () => {
    entries = [{ domContentLoadedEventEnd: 10.4, loadEventEnd: 20.6 }];

    expect(getRendererBootMetrics()).toMatchObject({ domContentLoadedMs: 10, loadMs: 21 });
  });

  it('returns null timings without a navigation entry', () => {
    expect(getRendererBootMetrics()).toMatchObject({
      domContentLoadedMs: null,
      loadMs: null
    });
  });
});

describe('themeTokens', () => {
  it('exposes non-empty token groups with unique entries', () => {
    for (const group of [BASE_TOKENS, BRAND_TOKENS, STATUS_TOKENS, PREVIEW_TOKENS]) {
      expect(group.length).toBeGreaterThan(0);
      expect(new Set(group).size).toBe(group.length);
    }
  });

  it('keeps the base tokens inside the preview set', () => {
    for (const token of BASE_TOKENS) expect(PREVIEW_TOKENS).toContain(token);
    expect(PREVIEW_TOKENS).toContain('primary');
    expect(STATUS_TOKENS).toContain('error');
  });
});

describe('menuActions', () => {
  it('routes reveal, open and terminal calls through IPC', () => {
    revealInFolder('D:/a');
    openWithDefaultApp('D:/b');
    openInTerminal('D:/c');
    copyPathViaMain('D:/d');

    expect(h.invoke.mock.calls).toEqual([
      ['shell:showItemInFolder', 'D:/a'],
      ['shell:openWithDefault', 'D:/b'],
      ['shell:openTerminal', 'D:/c'],
      ['fs:copyPath', 'D:/d']
    ]);
  });

  it('copies a path through the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    copyPathToClipboard('D:/path');

    expect(writeText).toHaveBeenCalledWith('D:/path');
  });

  it('tolerates missing preload and clipboard apis', () => {
    api.api = undefined;
    vi.stubGlobal('navigator', {});

    expect(() => {
      revealInFolder('x');
      copyPathToClipboard('y');
    }).not.toThrow();
  });
});

describe('notifyNative', () => {
  class FakeNotification {
    static permission: NotificationPermission = 'granted';
    static requestPermission = vi.fn();
    static instances: FakeNotification[] = [];
    constructor(
      public title: string,
      public options?: { body?: string; silent?: boolean }
    ) {
      FakeNotification.instances.push(this);
    }
  }

  beforeEach(() => {
    FakeNotification.instances = [];
    FakeNotification.permission = 'granted';
    FakeNotification.requestPermission.mockReset().mockResolvedValue('granted');
    vi.stubGlobal('Notification', FakeNotification);
  });

  it('does nothing without the Notification API', () => {
    vi.stubGlobal('Notification', undefined);

    expect(() => notifyNative('Title')).not.toThrow();
  });

  it('shows a notification when permitted', () => {
    notifyNative('Title', 'Body');

    expect(FakeNotification.instances).toEqual([
      expect.objectContaining({ title: 'Title', options: { body: 'Body', silent: false } })
    ]);
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it('requests permission when undecided and shows on grant', async () => {
    FakeNotification.permission = 'default';

    notifyNative('Title');

    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].options).toEqual({ body: undefined });
  });

  it('stays silent when permission is denied or not granted', async () => {
    FakeNotification.permission = 'denied';
    notifyNative('Title');
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();

    FakeNotification.permission = 'default';
    FakeNotification.requestPermission.mockResolvedValue('denied');
    notifyNative('Title');
    await Promise.resolve();
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it('swallows constructor failures', () => {
    vi.stubGlobal(
      'Notification',
      class {
        static permission = 'granted';
        constructor() {
          throw new Error('nope');
        }
      }
    );

    expect(() => notifyNative('Title')).not.toThrow();
  });
});
