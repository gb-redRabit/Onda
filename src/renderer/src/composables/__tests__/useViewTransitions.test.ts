import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useViewTransitions, supportsViewTransitions } from '../useViewTransitions';

// Guard routera dla View Transitions: musi puścić nawigację dokładnie raz,
// poczekać na `nextTick` (zrzut „nowego” stanu), a przy wyłączonym ruchu lub
// braku API nie opóźniać przejścia.

type Guard = (to: { name?: string }, from: { name?: string }) => unknown;

function fakeRouter() {
  let guard: Guard | null = null;
  return {
    beforeResolve(fn: Guard): () => void {
      guard = fn;
      return () => {
        guard = null;
      };
    },
    run(to: { name?: string }, from: { name?: string }): unknown {
      if (!guard) throw new Error('no guard registered');
      return guard(to, from);
    },
    get registered(): boolean {
      return guard !== null;
    }
  };
}

const reducedMotion = vi.fn(() => false);

beforeEach(() => {
  reducedMotion.mockReset();
  reducedMotion.mockReturnValue(false);
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => ({
      matches: reducedMotion(),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {}
    }),
    configurable: true
  });
});

function stubViewTransition(behaviour: 'run' | 'throw' = 'run'): {
  calls: number;
} {
  const state = { calls: 0 };
  Object.defineProperty(document, 'startViewTransition', {
    value: (callback: () => unknown) => {
      state.calls++;
      if (behaviour === 'throw') throw new Error('transition in progress');
      void Promise.resolve().then(callback);
      return { finished: Promise.resolve() };
    },
    configurable: true
  });
  return state;
}

describe('useViewTransitions', () => {
  it('reports whether the browser exposes the API', () => {
    Reflect.deleteProperty(document, 'startViewTransition');
    expect(supportsViewTransitions()).toBe(false);

    stubViewTransition();
    expect(supportsViewTransitions()).toBe(true);
  });

  it('starts a transition and releases navigation from inside its callback', async () => {
    const api = stubViewTransition();
    const router = fakeRouter();
    useViewTransitions(router as never);

    const navigation = router.run({ name: 'library' }, { name: 'home' });
    await expect(navigation).resolves.toBeUndefined();
    expect(api.calls).toBe(1);
  });

  it('skips the transition when the route name does not change', () => {
    const api = stubViewTransition();
    const router = fakeRouter();
    useViewTransitions(router as never);

    expect(router.run({ name: 'settings' }, { name: 'settings' })).toBe(true);
    expect(api.calls).toBe(0);
  });

  it('skips the transition when the user asked for reduced motion', () => {
    const api = stubViewTransition();
    reducedMotion.mockReturnValue(true);
    const router = fakeRouter();
    useViewTransitions(router as never);

    expect(router.run({ name: 'library' }, { name: 'home' })).toBe(true);
    expect(api.calls).toBe(0);
  });

  it('does not start a second transition while the first one runs', async () => {
    let resolveFinished = (): void => {};
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });
    const calls = { count: 0 };
    Object.defineProperty(document, 'startViewTransition', {
      value: (callback: () => unknown) => {
        calls.count++;
        void Promise.resolve().then(callback);
        return { finished };
      },
      configurable: true
    });
    const router = fakeRouter();
    useViewTransitions(router as never);

    await router.run({ name: 'library' }, { name: 'home' });
    expect(router.run({ name: 'settings' }, { name: 'library' })).toBe(true);
    expect(calls.count).toBe(1);

    resolveFinished();
    await finished;
    await Promise.resolve();

    await router.run({ name: 'downloads' }, { name: 'settings' });
    expect(calls.count).toBe(2);
  });

  it('still lets the navigation through when the API throws', async () => {
    stubViewTransition('throw');
    const router = fakeRouter();
    useViewTransitions(router as never);

    await expect(router.run({ name: 'library' }, { name: 'home' })).resolves.toBeUndefined();
  });
});
