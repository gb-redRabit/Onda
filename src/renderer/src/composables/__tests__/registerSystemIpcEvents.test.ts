import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openMediaFiles } from '@renderer/composables/useOpenMedia';

// Globalny nasłuch `providers:limit`: pokazuje toast z komunikatem limitu serwisu.

const uiNotify = vi.fn();
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: uiNotify }) }));
vi.mock('@renderer/i18n', () => ({ i18n: { global: { t: (k: string) => k } } }));
vi.mock('@renderer/composables/useOpenMedia', () => ({ openMediaFiles: vi.fn() }));

import { registerSystemIpcEvents } from '../appIpc/registerSystemIpcEvents';

let handlers: Map<string, (...args: unknown[]) => void>;

beforeEach(() => {
  uiNotify.mockClear();
  vi.mocked(openMediaFiles).mockClear();
  handlers = new Map();
  (window as unknown as { api: unknown }).api = {
    on: (channel: string, cb: (...args: unknown[]) => void) => {
      handlers.set(channel, cb);
      return () => {};
    },
    invoke: vi.fn(async () => [])
  };
});

describe('registerSystemIpcEvents — providers:limit', () => {
  it('pokazuje toast z komunikatem limitu serwisu', () => {
    registerSystemIpcEvents({} as never);
    expect(handlers.has('providers:limit')).toBe(true);
    handlers.get('providers:limit')!({ message: 'Service limit (MEGA) — try again in ~38 min' });
    expect(uiNotify).toHaveBeenCalledWith(
      'warning',
      'providers.limitTitle',
      'Service limit (MEGA) — try again in ~38 min'
    );
  });

  it('używa domyślnego komunikatu gdy brak treści', () => {
    registerSystemIpcEvents({} as never);
    handlers.get('providers:limit')!({});
    expect(uiNotify).toHaveBeenCalledWith(
      'warning',
      'providers.limitTitle',
      'providers.limitMessage'
    );
  });
});

describe('registerSystemIpcEvents — open-files', () => {
  it('opens only string paths and ignores malformed payloads', () => {
    registerSystemIpcEvents({} as never);
    const open = handlers.get('open-files')!;

    open(['/music/a.mp3', 42, null, '/music/b.mp3']);
    expect(openMediaFiles).toHaveBeenCalledWith(['/music/a.mp3', '/music/b.mp3'], {});

    vi.mocked(openMediaFiles).mockClear();
    open('not-an-array');
    open([]);
    expect(openMediaFiles).not.toHaveBeenCalled();
  });
});
