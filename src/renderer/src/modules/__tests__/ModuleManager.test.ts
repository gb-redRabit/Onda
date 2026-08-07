import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModuleManager, type AppModule } from '../ModuleManager';

function makeModule(id: string, overrides: Partial<AppModule> = {}): AppModule {
  return {
    id,
    name: id,
    activate: vi.fn(),
    isActive: vi.fn(() => false),
    ...overrides
  };
}

describe('ModuleManager', () => {
  let manager: ModuleManager;

  beforeEach(() => {
    manager = new ModuleManager();
  });

  it('registers and initializes modules sorted by priority', async () => {
    const low = makeModule('low', { priority: 1, init: vi.fn() });
    const high = makeModule('high', { priority: 10, init: vi.fn() });
    const none = makeModule('none', { init: vi.fn() });

    manager.register(low);
    manager.register(high);
    manager.register(none);

    await manager.initAll();
    expect(high.init).toHaveBeenCalled();
    expect(none.init).toHaveBeenCalled();
    expect(low.init).toHaveBeenCalled();

    // initAll is idempotent
    (high.init as ReturnType<typeof vi.fn>).mockClear();
    await manager.initAll();
    expect(high.init).not.toHaveBeenCalled();
  });

  it('calls deactivate on the active module when switching', async () => {
    const deactivate = vi.fn(async () => {});
    const a = makeModule('a', { isActive: vi.fn(() => false), deactivate });
    const b = makeModule('b');
    manager.register(a);
    manager.register(b);

    await manager.switchTo('a', { foo: 1 });
    expect(a.activate).toHaveBeenCalledWith({ foo: 1 });
    expect(manager.getActiveId()).toBe('a');

    await manager.switchTo('b');
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(manager.getActiveId()).toBe('b');
  });

  it('does not switch when module is not registered or already active', async () => {
    const a = makeModule('a', { isActive: vi.fn(() => true) });
    manager.register(a);

    await manager.switchTo('missing');
    expect(manager.getActive()).toBeNull();

    manager.switchTo('a');
    expect(manager.getActiveId()).toBe('a');
    await manager.switchTo('a');
    expect(a.activate).toHaveBeenCalledTimes(1);
  });

  it('deactivateAll only deactivates active modules', async () => {
    const a = makeModule('a', { isActive: vi.fn(() => false), deactivate: vi.fn() });
    const b = makeModule('b', { isActive: vi.fn(() => true), deactivate: vi.fn() });
    manager.register(a);
    manager.register(b);

    await manager.deactivateAll();
    expect(a.deactivate).not.toHaveBeenCalled();
    expect(b.deactivate).toHaveBeenCalledTimes(1);
    expect(manager.getActiveId()).toBeNull();
  });

  it('destroyAll calls destroy (optional) and clears modules', async () => {
    const destroy = vi.fn(async () => {});
    const a = makeModule('a', { destroy });
    const b = makeModule('b'); // no destroy
    manager.register(a);
    manager.register(b);

    await manager.destroyAll();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(manager.has('a')).toBe(false);
    expect(manager.has('b')).toBe(false);
  });

  it('get throws when module is missing', () => {
    manager.register(makeModule('a'));
    expect(() => manager.get('nope')).toThrow(/Module not found/);
  });

  it('logs a warning when switching to an unknown module', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await manager.switchTo('does-not-exist');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
