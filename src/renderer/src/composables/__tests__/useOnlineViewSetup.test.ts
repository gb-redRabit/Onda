import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, reactive, ref } from 'vue';

const h = vi.hoisted(() => ({
  online: null as any,
  ensureLoaded: vi.fn(),
  detectPlatform: vi.fn(),
  invoke: vi.fn()
}));

vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => h.online }));
vi.mock('@renderer/composables/useDownloadProfiles', () => ({
  useDownloadProfiles: () => ({ ensureLoaded: h.ensureLoaded })
}));
vi.mock('@shared/platform', () => ({ detectPlatform: h.detectPlatform }));

import { useOnlineViewSetup } from '../useOnlineViewSetup';

const api = window as unknown as { api?: { invoke: typeof h.invoke } };

function mountSetup(initial = '') {
  const input = ref(initial);
  const onKeydown = vi.fn();
  let avatarErrors: ReturnType<typeof useOnlineViewSetup>['avatarErrors'] | null = null;

  const Host = defineComponent({
    setup() {
      const result = useOnlineViewSetup(input, onKeydown);
      avatarErrors = result.avatarErrors;
      return () => null;
    }
  });
  const wrapper = mount(Host);
  return { wrapper, input, onKeydown, avatarErrors: avatarErrors! };
}

async function flushAsync(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  h.online = reactive({ subscriptions: [{ channelThumbnail: 'a' }] });
  h.ensureLoaded.mockReset().mockResolvedValue(undefined);
  h.detectPlatform.mockReset().mockReturnValue({ platform: 'youtube' });
  h.invoke.mockReset().mockResolvedValue('https://youtube.com/watch?v=1');
  api.api = { invoke: h.invoke };
});

describe('useOnlineViewSetup', () => {
  it('registers the keydown listener on mount and removes it on unmount', async () => {
    const { wrapper, onKeydown } = mountSetup();
    await flushAsync();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onKeydown).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onKeydown).toHaveBeenCalledTimes(1);
  });

  it('prefills the input from a supported clipboard link', async () => {
    h.invoke.mockResolvedValue('  https://youtube.com/watch?v=1  ');
    const { input } = mountSetup();

    await flushAsync();

    expect(h.invoke).toHaveBeenCalledWith('app:readClipboard');
    expect(input.value).toBe('https://youtube.com/watch?v=1');
    expect(h.ensureLoaded).toHaveBeenCalledTimes(1);
  });

  it('keeps an existing query', async () => {
    const { input } = mountSetup('already typed');

    await flushAsync();

    expect(input.value).toBe('already typed');
  });

  it('ignores unsupported or non-string clipboard content', async () => {
    h.detectPlatform.mockReturnValue(null);
    const first = mountSetup();
    await flushAsync();
    expect(first.input.value).toBe('');
    first.wrapper.unmount();

    h.invoke.mockResolvedValue(42);
    const second = mountSetup();
    await flushAsync();
    expect(second.input.value).toBe('');
  });

  it('swallows clipboard failures but still loads profiles', async () => {
    h.invoke.mockRejectedValue(new Error('clipboard unavailable'));
    const { input } = mountSetup();

    await expect(flushAsync()).resolves.toBeUndefined();

    expect(input.value).toBe('');
    expect(h.ensureLoaded).toHaveBeenCalledTimes(1);
  });

  it('clears avatar errors when subscription thumbnails change', async () => {
    const { avatarErrors } = mountSetup();
    await flushAsync();
    avatarErrors.value = { bad: true };

    h.online.subscriptions = [{ channelThumbnail: 'b' }];
    await nextTick();

    expect(avatarErrors.value).toEqual({});
  });

  it('keeps avatar errors when thumbnails are unchanged', async () => {
    const { avatarErrors } = mountSetup();
    await flushAsync();
    avatarErrors.value = { bad: true };

    h.online.subscriptions.push({ channelThumbnail: 'b' });
    await nextTick();

    expect(avatarErrors.value).toEqual({});
  });
});
