import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string, params?: unknown) => (params ? `${key}:${JSON.stringify(params)}` : key)),
  notify: vi.fn(),
  loggerError: vi.fn(),
  formatSize: vi.fn((size: number) => `size:${size}`),
  overlay: vi.fn(),
  guard: null as any,
  invoke: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: h.notify }) }));
vi.mock('@renderer/composables/useUnsavedGuard', () => ({
  useUnsavedGuard: (options: unknown) => {
    h.guard = options;
    return { onOverlayClick: h.overlay };
  }
}));
vi.mock('@shared/logger', () => ({
  logger: { error: h.loggerError, warn: vi.fn(), info: vi.fn() }
}));
vi.mock('@renderer/utils/formatters', () => ({ formatFileSize: h.formatSize }));

const ModalStub = defineComponent({
  name: 'ModalShell',
  props: ['labelledBy', 'panelClass'],
  emits: ['close', 'escape'],
  template: '<div data-testid="modal"><slot /></div>'
});

import ExplorerPropertiesDialog from '../ExplorerPropertiesDialog.vue';

let wrapper: VueWrapper | null = null;

function fileItem(overrides: Record<string, unknown> = {}) {
  return {
    name: 'song.mp3',
    path: 'D:/music/song.mp3',
    isDirectory: false,
    size: 1234,
    createdAt: new Date('2023-01-02T10:00:00').getTime(),
    modifiedAt: new Date('2024-05-06T10:00:00').getTime(),
    extension: 'mp3',
    ...overrides
  } as never;
}

function setup(item = fileItem()) {
  wrapper = mount(ExplorerPropertiesDialog, {
    props: { item },
    global: {
      mocks: {
        $t: (key: string, params?: unknown) => (params ? `${key}:${JSON.stringify(params)}` : key)
      },
      stubs: { ModalShell: ModalStub }
    }
  });
  return wrapper;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

beforeEach(() => {
  h.t.mockClear();
  h.notify.mockReset();
  h.loggerError.mockReset();
  h.formatSize.mockClear();
  h.overlay.mockReset();
  h.guard = null;
  h.invoke.mockReset();
  h.invoke.mockImplementation(async (channel: string) => {
    if (channel === 'fs:getProperties') {
      return {
        name: 'Music',
        path: 'D:/music',
        isDirectory: true,
        size: 0,
        createdAt: 1,
        modifiedAt: 2,
        totalSize: 4096,
        itemCount: 5,
        dirCount: 2,
        fileCount: 3
      };
    }
    return undefined;
  });
  (window as unknown as { api?: unknown }).api = { invoke: h.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  delete (window as unknown as { api?: unknown }).api;
});

describe('loading', () => {
  it('loads and renders directory aggregates', async () => {
    setup(fileItem({ name: 'Music', path: 'D:/music', isDirectory: true, extension: '' }));
    await settle();

    expect(h.invoke).toHaveBeenCalledWith('fs:getProperties', 'D:/music');
    expect(wrapper!.text()).toContain('explorer.propertiesContainsValue:{"n":5,"d":2,"f":3}');
    expect(wrapper!.text()).toContain('size:4096');
    expect(h.formatSize).toHaveBeenCalledWith(4096);
  });

  it('renders file details without a lookup result', async () => {
    setup();
    await settle();

    expect(wrapper!.text()).toContain('song.mp3');
    expect(wrapper!.text()).toContain('mp3');
    expect(wrapper!.text()).toContain('size:1234');
    expect(wrapper!.text()).toContain('D:/music/song.mp3');
    expect(wrapper!.text()).toContain('2023');
    expect(wrapper!.text()).toContain('2024');
    expect(wrapper!.text()).not.toContain('explorer.propertiesContainsValue');
  });

  it('falls back to a dash without an extension and item size', async () => {
    h.invoke.mockResolvedValueOnce(null);
    setup(fileItem({ extension: undefined, size: 77 }));
    await settle();

    expect(wrapper!.text()).toContain('—');
    expect(wrapper!.text()).toContain('size:77');
  });

  it('logs lookup failures', async () => {
    h.invoke.mockRejectedValueOnce(new Error('fs'));
    setup(fileItem({ isDirectory: true }));
    await settle();

    expect(h.loggerError).toHaveBeenCalledWith('Explorer', 'getProperties', expect.any(Error));
  });

  it('reloads when the item changes', async () => {
    setup();
    await settle();
    h.invoke.mockClear();

    await wrapper!.setProps({ item: fileItem({ name: 'other.mp3', path: 'D:/other.mp3' }) });
    await settle();

    expect(h.invoke).toHaveBeenCalledWith('fs:getProperties', 'D:/other.mp3');
    expect((wrapper!.get('input').element as HTMLInputElement).value).toBe('other.mp3');
  });
});

describe('renaming', () => {
  it('renames and reports the change', async () => {
    setup();
    await settle();

    await wrapper!.get('input').setValue('  new name.mp3  ');
    await wrapper!
      .findAll('button')
      .find((button) => button.text() === 'common.ok')!
      .trigger('click');
    await settle();

    expect(h.invoke).toHaveBeenCalledWith('media:renameFile', 'D:/music/song.mp3', 'new name.mp3');
    expect(wrapper!.emitted('renamed')).toHaveLength(1);
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('closes without renaming when the name is unchanged', async () => {
    setup();
    await settle();

    await wrapper!
      .findAll('button')
      .find((button) => button.text() === 'common.ok')!
      .trigger('click');
    await settle();

    expect(h.invoke).not.toHaveBeenCalledWith(
      'media:renameFile',
      expect.anything(),
      expect.anything()
    );
    expect(wrapper!.emitted('renamed')).toBeUndefined();
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('applies on Enter in the name field', async () => {
    setup();
    await settle();
    const input = wrapper!.get('input');
    await input.setValue('renamed.mp3');
    await input.trigger('keydown', { key: 'Enter' });
    await settle();

    expect(h.invoke).toHaveBeenCalledWith('media:renameFile', 'D:/music/song.mp3', 'renamed.mp3');
    expect(wrapper!.emitted('renamed')).toHaveLength(1);
  });
});

describe('closing and guard', () => {
  it('closes from cancel, the X button and Escape', async () => {
    setup();
    await settle();

    await wrapper!
      .findAll('button')
      .find((button) => button.text() === 'common.cancel')!
      .trigger('click');
    await wrapper!.get('[aria-label="common.close"]').trigger('click');
    wrapper!.findComponent(ModalStub).vm.$emit('escape');

    expect(wrapper!.emitted('close')).toHaveLength(3);
  });

  it('delegates overlay clicks to the unsaved guard', async () => {
    setup();
    await settle();

    wrapper!.findComponent(ModalStub).vm.$emit('close');

    expect(h.overlay).toHaveBeenCalled();
  });

  it('configures the unsaved guard', async () => {
    setup();
    await settle();

    expect(h.guard.isDirty()).toBe(false);
    await wrapper!.get('input').setValue('changed.mp3');
    expect(h.guard.isDirty()).toBe(true);

    h.guard.onDirtyHint();
    expect(h.notify).toHaveBeenCalledWith('warning', 'common.unsavedChangesClickAgain');
    h.guard.onCleanHint();
    expect(h.notify).toHaveBeenCalledWith('info', 'common.clickAgainToClose');
    h.guard.onClose();
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });
});
