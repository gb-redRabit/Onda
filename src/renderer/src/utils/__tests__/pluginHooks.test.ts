import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  warn: vi.fn()
}));

vi.mock('@shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn() }
}));

import { isKnownHook, pluginHookBus } from '../pluginHooks';

beforeEach(() => {
  h.warn.mockClear();
});

describe('plugin hook bus', () => {
  it('delivers payloads to subscribed listeners', () => {
    const listener = vi.fn();
    const unsubscribe = pluginHookBus.on('track:play', listener);

    pluginHookBus.emit('track:play', { path: 'D:/a.mp3' });

    expect(listener).toHaveBeenCalledWith({ path: 'D:/a.mp3' });
    unsubscribe();
  });

  it('defaults the payload to an empty object', () => {
    const listener = vi.fn();
    pluginHookBus.on('app:start', listener);

    pluginHookBus.emit('app:start');

    expect(listener).toHaveBeenCalledWith({});
  });

  it('stops delivery after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = pluginHookBus.on('track:end', listener);
    unsubscribe();

    pluginHookBus.emit('track:end', {});

    expect(listener).not.toHaveBeenCalled();
  });

  it('supports explicit off', () => {
    const listener = vi.fn();
    pluginHookBus.on('library:scan', listener);
    pluginHookBus.off('library:scan', listener);

    pluginHookBus.emit('library:scan', {});

    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores unknown hook names', () => {
    const listener = vi.fn();
    pluginHookBus.on('track:play', listener);

    pluginHookBus.emit('unknown:hook' as never, {});

    expect(listener).not.toHaveBeenCalled();
    expect(isKnownHook('track:play')).toBe(true);
    expect(isKnownHook('unknown')).toBe(false);
  });

  it('isolates a throwing listener and logs it', () => {
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    pluginHookBus.on('download:start', bad);
    pluginHookBus.on('download:start', good);

    pluginHookBus.emit('download:start', { id: 'j1' });

    expect(good).toHaveBeenCalledWith({ id: 'j1' });
    expect(h.warn).toHaveBeenCalledWith(
      'plugins',
      'hook listener threw',
      'download:start',
      expect.any(Error)
    );
  });

  it('allows unsubscribing a missing hook safely', () => {
    expect(() => pluginHookBus.off('track:queued', vi.fn())).not.toThrow();
  });
});
