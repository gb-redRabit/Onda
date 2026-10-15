import { describe, it, expect, vi, beforeEach } from 'vitest';

// Globalny nasłuch `providers:limit`: pokazuje toast z komunikatem limitu serwisu.

const uiNotify = vi.fn();
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: uiNotify }) }));
vi.mock('@renderer/i18n', () => ({ i18n: { global: { t: (k: string) => k } } }));
vi.mock('@renderer/composables/useOpenMedia', () => ({ openMediaFiles: vi.fn() }));

import { registerSystemIpcEvents } from '../appIpc/registerSystemIpcEvents';

let handlers: Map<string, (...args: unknown[]) => void>;

beforeEach(() => {
  uiNotify.mockClear();
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
