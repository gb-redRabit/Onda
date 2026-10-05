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

    // initAll jest idempotentne
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

    await manager.switchTo('a');
    expect(manager.getActiveId()).toBe('a');
    await manager.switchTo('a');
    expect(a.activate).toHaveBeenCalledTimes(1);
  });

  it('awaits an asynchronous activate before marking the module active', async () => {
    let releaseActivate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseActivate = resolve;
    });
    const activate = vi.fn(() => gate);
    const a = makeModule('a', { activate });
    manager.register(a);

    const switching = manager.switchTo('a');
    // Moduł nie może być uznany za aktywny, dopóki `activate` się nie zakończy.
    expect(manager.getActiveId()).toBeNull();
    releaseActivate();
    await switching;
    expect(manager.getActiveId()).toBe('a');
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
    const b = makeModule('b'); // brak destroy
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

  it('keeps the last requested module when two switches overlap', async () => {
    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const a = makeModule('a', { activate: vi.fn(() => gateA) });
    const b = makeModule('b', { activate: vi.fn() });
    manager.register(a);
    manager.register(b);

    // 'a' zawiesza się w `activate`, więc 'b' startuje i kończy pierwsze.
    const switchA = manager.switchTo('a');
    await manager.switchTo('b');
    expect(manager.getActiveId()).toBe('b');

    // Spóźnione 'a' nie może nadpisać 'b'.
    releaseA();
    await switchA;
    expect(manager.getActiveId()).toBe('b');
  });

  it('deactivates a stale activation that marked itself active before its await', async () => {
    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    let aActive = false;
    const aDeactivate = vi.fn(async () => {
      aActive = false;
    });
    const a = makeModule('a', {
      activate: vi.fn(async () => {
        aActive = true;
        await gateA;
      }),
      deactivate: aDeactivate,
      isActive: () => aActive
    });
    const b = makeModule('b', { activate: vi.fn(), isActive: () => false });
    manager.register(a);
    manager.register(b);

    const switchA = manager.switchTo('a'); // ustawia aActive=true, blokuje na gateA
    await manager.switchTo('b');
    expect(manager.getActiveId()).toBe('b');

    releaseA();
    await switchA;
    // Spóźniona aktywacja 'a' musi zostać zdjęta, żeby nie została „aktywna" w tle.
    expect(aDeactivate).toHaveBeenCalledTimes(1);
    expect(manager.getActiveId()).toBe('b');
  });

  it('does not leave an active module when activate rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const a = makeModule('a', {
        activate: vi.fn(() => Promise.reject(new Error('boom')))
      });
      manager.register(a);
      await manager.switchTo('a');
      expect(manager.getActiveId()).toBeNull();
    } finally {
      errorSpy.mockRestore();
    }
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
