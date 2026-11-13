import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  t: vi.fn((key: string) => key),
  on: vi.fn(),
  cleanup: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: mocks.t }) }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: mocks.notify }) }));

import { useToolMessages } from '../useToolMessages';

let handler: ((payload: unknown) => void) | null = null;
let wrapper: VueWrapper | null = null;
let originalApi: Window['api'];

function mountConsumer() {
  const Host = defineComponent({
    setup() {
      useToolMessages();
      return () => null;
    }
  });
  wrapper = mount(Host);
  return wrapper;
}

beforeEach(() => {
  originalApi = window.api;
  handler = null;
  mocks.notify.mockClear();
  mocks.t.mockClear();
  mocks.on.mockReset().mockImplementation(((_channel: string, cb: (payload: unknown) => void) => {
    handler = cb;
    return mocks.cleanup;
  }) as never);
  mocks.cleanup.mockClear();
  window.api = { ...originalApi, on: mocks.on } as Window['api'];
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  window.api = originalApi;
});

describe('registration', () => {
  it('subscribes on mount and unsubscribes on unmount', () => {
    mountConsumer();

    expect(mocks.on).toHaveBeenCalledWith('tools:message', expect.any(Function));

    wrapper!.unmount();
    wrapper = null;

    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
  });

  it('tolerates a missing preload API', () => {
    window.api = undefined as never;

    expect(() => mountConsumer()).not.toThrow();
  });
});

describe('message handling', () => {
  it.each([
    ['conversion-complete', 'tools.conversionComplete'],
    ['clip-complete', 'tools.clipComplete'],
    ['concat-complete', 'tools.concatComplete']
  ])('notifies for %s', (type, key) => {
    mountConsumer();

    handler!({ type, payload: { name: 'file.mp4' } });

    expect(mocks.notify).toHaveBeenCalledWith('success', key, 'file.mp4');
    expect(mocks.t).toHaveBeenCalledWith(key);
  });

  it('omits the detail when the payload has no usable name', () => {
    mountConsumer();

    for (const payload of [{}, { name: 42 }, null, 'text', { other: true }]) {
      handler!({ type: 'conversion-complete', payload });
    }

    expect(mocks.notify).toHaveBeenCalledTimes(5);
    for (const call of mocks.notify.mock.calls) {
      expect(call[2]).toBeUndefined();
    }
  });

  it('ignores unrelated messages', () => {
    mountConsumer();

    handler!({ type: 'unknown' });
    handler!({});
    handler!(null);

    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
