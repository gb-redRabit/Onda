import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';

const state = vi.hoisted(() => ({
  notify: vi.fn(),
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
  getFontCacheStats: vi.fn(),
  clearFontCache: vi.fn()
}));

vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: state.notify }) }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));

import SettingsSubtitles from '../SettingsSubtitles.vue';

const GroupStub = { props: ['title', 'description'], template: '<div><slot /></div>' };
const RowStub = {
  props: ['label', 'description'],
  template: '<div class="row"><slot /></div>'
};

let wrapper: VueWrapper | null = null;
let originalApi: Window['api'];

function mountSettings() {
  wrapper = mount(SettingsSubtitles, {
    global: {
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) =>
          params ? `${key}:${JSON.stringify(params)}` : key
      },
      stubs: { SettingsGroup: GroupStub, SettingsRow: RowStub }
    }
  });
  return wrapper;
}

beforeEach(() => {
  originalApi = window.api;
  window.api = {
    ...originalApi,
    getFontCacheStats: state.getFontCacheStats,
    clearFontCache: state.clearFontCache
  } as Window['api'];
  state.notify.mockClear();
  state.t.mockClear();
  state.getFontCacheStats.mockReset().mockResolvedValue({ files: 3, bytes: 512, videos: 2 });
  state.clearFontCache.mockReset().mockResolvedValue({ removed: 3 });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  window.api = originalApi;
});

describe('font cache stats', () => {
  it('loads stats on mount and renders the summary', async () => {
    mountSettings();
    await flushPromises();

    expect(state.getFontCacheStats).toHaveBeenCalledTimes(1);
    expect(wrapper!.text()).toContain('settings.fontCache');
    expect(wrapper!.text()).toContain('settings.fontCacheStats');
    expect(wrapper!.text()).toContain('"files":3');
    expect(wrapper!.text()).toContain('"videos":2');
    expect(wrapper!.text()).toContain('"size":"512 B"');
  });

  it('formats kilobyte and megabyte sizes', async () => {
    state.getFontCacheStats.mockResolvedValue({ files: 1, bytes: 2048, videos: 0 });
    mountSettings();
    await flushPromises();
    expect(wrapper!.text()).toContain('"size":"2.0 KB"');

    wrapper!.unmount();
    state.getFontCacheStats.mockResolvedValue({ files: 1, bytes: 3 * 1024 * 1024, videos: 0 });
    mountSettings();
    await flushPromises();
    expect(wrapper!.text()).toContain('"size":"3.0 MB"');
  });

  it('falls back to zeros without stats', async () => {
    state.getFontCacheStats.mockResolvedValue(null);
    mountSettings();
    await flushPromises();

    expect(wrapper!.text()).toContain('"files":0');
    expect(wrapper!.text()).toContain('"videos":0');
    expect(wrapper!.text()).toContain('"size":"0 B"');
  });

  it('reports a stats read failure', async () => {
    state.getFontCacheStats.mockRejectedValue(new Error('ipc'));
    mountSettings();
    await flushPromises();

    expect(state.notify).toHaveBeenCalledWith(
      'error',
      'settings.fontCacheStatsError',
      'Error: ipc'
    );
  });
});

describe('clearing the cache', () => {
  async function clickClear() {
    const button = wrapper!.find('button');
    await button.trigger('click');
    await flushPromises();
  }

  it('clears the cache, reports the removal count and reloads stats', async () => {
    mountSettings();
    await flushPromises();
    state.getFontCacheStats.mockClear();

    await clickClear();

    expect(state.clearFontCache).toHaveBeenCalledTimes(1);
    expect(state.notify).toHaveBeenCalledWith(
      'success',
      expect.stringContaining('settings.fontCacheCleared')
    );
    expect(state.getFontCacheStats).toHaveBeenCalledTimes(1);
  });

  it('defaults the removal count to zero', async () => {
    state.clearFontCache.mockResolvedValue(undefined);
    mountSettings();
    await flushPromises();

    await clickClear();

    expect(state.notify).toHaveBeenCalledWith(
      'success',
      expect.stringContaining('settings.fontCacheCleared:{"n":0}')
    );
  });

  it('reports a clearing failure', async () => {
    state.clearFontCache.mockRejectedValue(new Error('locked'));
    mountSettings();
    await flushPromises();
    state.getFontCacheStats.mockClear();

    await clickClear();

    expect(state.notify).toHaveBeenCalledWith(
      'error',
      'settings.fontCacheClearError',
      'Error: locked'
    );
    expect(state.getFontCacheStats).not.toHaveBeenCalled();
  });
});
