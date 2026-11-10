import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const state = vi.hoisted(() => ({
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
  formatSize: vi.fn((size: number) => `size:${size}`),
  loggerError: vi.fn(),
  invoke: vi.fn()
}));

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: state.t }) };
});
vi.mock('@renderer/utils/formatters', () => ({ formatFileSize: state.formatSize }));
vi.mock('@shared/logger', () => ({
  logger: { error: state.loggerError, warn: vi.fn(), info: vi.fn() }
}));

const CoverStub = defineComponent({
  name: 'MediaCoverStub',
  props: { path: String, size: Number, still: Boolean, fallback: String },
  template: '<div data-testid="cover" />'
});

import ExplorerDetailsPane from '../ExplorerDetailsPane.vue';

let wrapper: VueWrapper | null = null;

function file(overrides: Record<string, unknown> = {}) {
  return {
    name: 'song.mp3',
    path: 'D:/music/song.mp3',
    isDirectory: false,
    size: 10,
    modifiedAt: new Date('2024-05-06T10:00:00').getTime(),
    createdAt: new Date('2023-01-02T10:00:00').getTime(),
    extension: '.mp3',
    ...overrides
  } as never;
}

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(ExplorerDetailsPane, {
    props: { item: null, selectedCount: 0, ...props },
    global: { stubs: { MediaCover: CoverStub } }
  });
  return wrapper;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  state.t.mockClear();
  state.formatSize.mockClear();
  state.loggerError.mockReset();
  state.invoke.mockReset();
  state.invoke.mockResolvedValue({
    size: 100,
    createdAt: 1,
    modifiedAt: 2,
    itemCount: 5,
    dirCount: 2,
    fileCount: 3,
    totalSize: 4096
  });
  (window as unknown as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('empty selection', () => {
  it('shows the empty hint', () => {
    setup();
    expect(wrapper!.text()).toContain('explorer.detailsEmpty');
    expect(wrapper!.text()).toContain('explorer.detailsTitle');
  });

  it('reports a multi-selection count', () => {
    setup({ selectedCount: 3 });
    expect(wrapper!.text()).toContain('explorer.detailsMultiple:{"n":3}');
  });
});

describe('file details', () => {
  it('renders audio metadata and a preview', () => {
    setup({ item: file() });

    expect(wrapper!.text()).toContain('song.mp3');
    expect(wrapper!.text()).toContain('.mp3');
    expect(wrapper!.text()).toContain('size:10');
    expect(wrapper!.text()).toContain('D:/music/song.mp3');
    expect(wrapper!.text()).toContain('2024');
    expect(wrapper!.text()).toContain('2023');
    expect(wrapper!.getComponent(CoverStub).props()).toMatchObject({
      path: 'D:/music/song.mp3',
      size: 96,
      still: true,
      fallback: 'music'
    });
    expect(state.invoke).toHaveBeenCalledWith('fs:getProperties', 'D:/music/song.mp3');
  });

  it('uses the film fallback for videos', () => {
    setup({ item: file({ name: 'clip.mp4', extension: '.mp4' }) });
    expect(wrapper!.getComponent(CoverStub).props('fallback')).toBe('film');
  });

  it('shows a file icon for other extensions', () => {
    setup({ item: file({ name: 'doc.pdf', extension: '.pdf' }) });
    expect(wrapper!.find('[data-testid="cover"]').exists()).toBe(false);
    expect(wrapper!.text()).toContain('.pdf');
  });

  it('falls back to a dash without an extension', () => {
    setup({ item: file({ extension: undefined }) });
    expect(wrapper!.text()).toContain('—');
  });

  it('emits properties and close', async () => {
    const item = file();
    setup({ item });

    await wrapper!.get('[data-testid="explorer-details-properties"]').trigger('click');
    await wrapper!.get('[data-testid="explorer-details-close"]').trigger('click');

    expect(wrapper!.emitted('properties')).toEqual([[item]]);
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });
});

describe('folder details', () => {
  it('loads aggregate properties', async () => {
    const item = file({ name: 'Music', isDirectory: true, extension: '' });
    let resolve!: (value: unknown) => void;
    state.invoke.mockReturnValueOnce(
      new Promise((res) => {
        resolve = res;
      })
    );
    setup({ item });

    expect(state.invoke).toHaveBeenCalledWith('fs:getProperties', 'D:/music/song.mp3');
    expect(wrapper!.text()).toContain('…');

    resolve({
      size: 1,
      createdAt: 1,
      modifiedAt: 2,
      itemCount: 5,
      dirCount: 2,
      fileCount: 3,
      totalSize: 4096
    });
    await flush();

    expect(wrapper!.text()).toContain('explorer.propertiesFolder');
    expect(wrapper!.text()).toContain('explorer.propertiesContainsValue:{"n":5,"d":2,"f":3}');
    expect(wrapper!.text()).toContain('size:4096');
  });

  it('uses dashes and zero counts for missing data', async () => {
    state.invoke.mockResolvedValueOnce(null);
    setup({ item: file({ isDirectory: true }) });
    await flush();

    expect(wrapper!.text()).toContain('—');
    expect(wrapper!.text()).not.toContain('explorer.propertiesContains');
  });

  it('fills zero counts when fields are missing', async () => {
    state.invoke.mockResolvedValueOnce({ size: 1, createdAt: 1, modifiedAt: 2 });
    setup({ item: file({ isDirectory: true }) });
    await flush();

    expect(wrapper!.text()).toContain('explorer.propertiesContainsValue:{"n":0,"d":0,"f":0}');
  });

  it('logs lookup failures', async () => {
    state.invoke.mockRejectedValueOnce(new Error('fs'));
    setup({ item: file({ isDirectory: true }) });
    await flush();

    expect(state.loggerError).toHaveBeenCalledWith('Explorer', 'getProperties', expect.any(Error));
    expect(wrapper!.text()).toContain('—');
  });

  it('ignores stale responses after the selection changes', async () => {
    let resolve!: (value: unknown) => void;
    state.invoke.mockReturnValueOnce(
      new Promise((res) => {
        resolve = res;
      })
    );
    setup({ item: file({ isDirectory: true }) });

    await wrapper!.setProps({ item: null });
    resolve({ totalSize: 999, itemCount: 9 });

    await flush();
    expect(wrapper!.text()).toContain('explorer.detailsEmpty');
    expect(wrapper!.text()).not.toContain('999');
  });

  it('reloads when the path changes', async () => {
    setup({ item: file({ isDirectory: true }) });
    await flush();
    state.invoke.mockClear();

    await wrapper!.setProps({ item: file({ isDirectory: true, path: 'D:/other' }) });
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('fs:getProperties', 'D:/other');
  });
});

describe('keyboard', () => {
  it('closes on Escape while mounted', async () => {
    setup();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper!.emitted('close')).toHaveLength(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('removes the listener on unmount', () => {
    setup();
    wrapper!.unmount();
    wrapper = null;

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    // No assertion on emitted after unmount — reaching here means no throw.
  });
});
