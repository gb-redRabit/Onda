import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  handlers: {} as Record<string, (payload: unknown) => void>,
  on: vi.fn(),
  off: vi.fn(),
  invoke: vi.fn()
}));

let wrapper: VueWrapper | null = null;

async function load() {
  vi.resetModules();
  return import('../useToolBridge');
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

async function mountBridge(mod: Awaited<ReturnType<typeof load>>) {
  let state: any = null;
  const Comp = defineComponent({
    setup() {
      state = mod.useToolBridge();
      return () => null;
    }
  });
  wrapper = mount(Comp);
  await flush();
  return state;
}

const validContext = { toolId: 'image-studio', params: { path: 'D:/a.png' } } as never;

beforeEach(() => {
  h.handlers = {};
  h.on.mockReset();
  h.on.mockImplementation((channel: string, handler: (payload: unknown) => void) => {
    h.handlers[channel] = handler;
    return h.off;
  });
  h.off.mockReset();
  h.invoke.mockReset();
  h.invoke.mockResolvedValue(null);
  (window as unknown as { api?: unknown }).api = { on: h.on, invoke: h.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  delete (window as unknown as { api?: unknown }).api;
});

describe('initial context', () => {
  it('fetches context after mounting the listener', async () => {
    h.invoke.mockResolvedValue(validContext);
    const mod = await load();
    const state = await mountBridge(mod);

    expect(h.on).toHaveBeenCalledWith('tools:context', expect.any(Function));
    expect(h.invoke).toHaveBeenCalledWith('tools:getContext');
    expect(state.context.value).toEqual(validContext);
  });

  it('ignores invalid initial payloads', async () => {
    for (const invalid of [
      null,
      'x',
      [],
      { toolId: 5, params: {} },
      { toolId: 'a', params: null }
    ]) {
      h.invoke.mockResolvedValueOnce(invalid);
      const mod = await load();
      const state = await mountBridge(mod);
      expect(state.context.value).toBeNull();
      wrapper!.unmount();
      wrapper = null;
    }
  });

  it('stays null when the fetch rejects', async () => {
    h.invoke.mockRejectedValueOnce(new Error('ipc'));
    const mod = await load();
    const state = await mountBridge(mod);

    expect(state.context.value).toBeNull();
  });

  it('pushes valid contexts and ignores invalid ones', async () => {
    const mod = await load();
    const state = await mountBridge(mod);

    h.handlers['tools:context'](validContext);
    expect(state.context.value).toEqual(validContext);

    h.handlers['tools:context']({ toolId: 'x', params: [] });
    expect(state.context.value).toEqual(validContext);
  });
});

describe('prefetched context', () => {
  it('uses the prefetched value and skips the initial fetch', async () => {
    const mod = await load();
    mod.setPrefetchedToolContext(validContext);
    const state = await mountBridge(mod);

    expect(state.context.value).toEqual(validContext);
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.on).toHaveBeenCalledWith('tools:context', expect.any(Function));
  });

  it('treats an explicit null prefetch as loaded', async () => {
    const mod = await load();
    mod.setPrefetchedToolContext(null);
    const state = await mountBridge(mod);

    expect(state.context.value).toBeNull();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('keeps the initial context when a later fetch returns data', async () => {
    h.invoke.mockResolvedValue(validContext);
    const mod = await load();
    const state = await mountBridge(mod);
    expect(state.context.value).toEqual(validContext);
  });
});

describe('lifecycle and messaging', () => {
  it('removes the context listener on unmount', async () => {
    const mod = await load();
    await mountBridge(mod);

    wrapper!.unmount();
    wrapper = null;

    expect(h.off).toHaveBeenCalled();
  });

  it('sends messages and reports the result', async () => {
    h.invoke.mockImplementation(async (channel: string) =>
      channel === 'tools:sendToMain' ? true : null
    );
    const mod = await load();
    const state = await mountBridge(mod);

    await expect(state.sendToMain('hello', { a: 1 })).resolves.toBe(true);
    expect(h.invoke).toHaveBeenCalledWith('tools:sendToMain', {
      type: 'hello',
      payload: { a: 1 }
    });
  });

  it('returns false when sending fails', async () => {
    h.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'tools:sendToMain') throw new Error('ipc');
      return null;
    });
    const mod = await load();
    const state = await mountBridge(mod);

    await expect(state.sendToMain('hello')).resolves.toBe(false);
  });
});
