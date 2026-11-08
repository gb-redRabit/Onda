import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

const state = vi.hoisted(() => ({
  library: null as any,
  ui: null as any,
  settings: null as any,
  prompt: null as any,
  invoke: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/composables/usePromptDialog', () => ({ usePromptDialog: () => state.prompt }));

import SettingsLibraryFolders from '../SettingsLibraryFolders.vue';

const GroupStub = defineComponent({
  name: 'SettingsGroup',
  props: { title: String, description: String, padded: Boolean },
  template: '<section :data-title="title"><slot /></section>'
});

const RowStub = defineComponent({
  name: 'SettingsRow',
  props: { label: String, description: String, path: String, anchor: String, wide: Boolean },
  template: '<div :data-path="path"><slot /></div>'
});

const SwitchStub = defineComponent({
  name: 'SettingsSwitchStub',
  props: { modelValue: Boolean, label: String },
  emits: ['update:modelValue'],
  template: '<button data-testid="switch" :aria-checked="modelValue" />'
});

const SliderStub = defineComponent({
  name: 'Slider',
  props: {
    modelValue: Number,
    label: String,
    min: Number,
    max: Number,
    step: Number,
    valueText: String
  },
  emits: ['update:modelValue'],
  template: '<button data-testid="slider" />'
});

const PromptStub = defineComponent({
  name: 'ExplorerPromptDialog',
  props: { visible: Boolean, isConfirm: Boolean, message: String, value: String },
  emits: ['update:value', 'confirm', 'cancel'],
  template: `<div data-testid="prompt" :data-visible="visible">
    <button data-testid="prompt-confirm" @click="$emit('confirm')" />
    <button data-testid="prompt-cancel" @click="$emit('cancel')" />
    <button data-testid="prompt-input" @click="$emit('update:value', 'typed')" />
  </div>`
});

const stubs = {
  SettingsGroup: GroupStub,
  SettingsRow: RowStub,
  Slider: SliderStub,
  Switch: SwitchStub,
  ExplorerPromptDialog: PromptStub
};

let wrapper: VueWrapper | null = null;

function setup() {
  wrapper = mount(SettingsLibraryFolders, {
    global: { stubs, mocks: { $t: (key: string) => key } }
  });
  return wrapper;
}

function buttons() {
  return wrapper!.findAll('button');
}

function buttonWithText(text: string) {
  return buttons().find((button) => button.text().includes(text))!;
}

beforeEach(() => {
  state.library = {
    folders: [],
    isScanning: false,
    scanProgress: { current: 0, total: 0 },
    totalCount: 0,
    audioCount: 0,
    videoCount: 0,
    getFolderType: vi.fn(() => 'audio'),
    removeFolder: vi.fn(),
    addFolder: vi.fn(async () => undefined),
    scanFolders: vi.fn(async () => undefined),
    cancelScan: vi.fn()
  };
  state.ui = { notify: vi.fn() };
  state.settings = {
    library: { fastScan: false, coverCacheMaxEntries: 1000 },
    updateLibrary: vi.fn()
  };
  state.prompt = {
    showConfirm: vi.fn(async () => true),
    promptVisible: ref(false),
    promptIsConfirm: ref(false),
    promptMessage: ref(''),
    promptValue: ref(''),
    promptConfirm: vi.fn(),
    promptCancel: vi.fn()
  };
  state.invoke.mockReset();
  state.invoke.mockResolvedValue({ success: true });
  state.t.mockClear();
  (window as unknown as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  delete (window as unknown as { api?: unknown }).api;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('folder list', () => {
  it('shows an empty hint and disables scanning', () => {
    setup();

    expect(wrapper!.text()).toContain('settings.libEmpty');
    expect(buttonWithText('settings.libScanNow').attributes('disabled')).toBeDefined();
  });

  it('lists folders with a type icon and label', () => {
    state.library.folders = ['C:/Music', 'D:/Movies', 'E:/Pics', 'F:/Mixed', 'G:/Other'];
    state.library.getFolderType.mockImplementation((path: string) => {
      if (path === 'C:/Music') return 'audio';
      if (path === 'D:/Movies') return 'video';
      if (path === 'E:/Pics') return 'image';
      if (path === 'F:/Mixed') return 'mixed';
      return 'unknown';
    });
    setup();

    const text = wrapper!.text();
    expect(text).toContain('C:/Music');
    expect(text).toContain('🎵');
    expect(text).toContain('🎬');
    expect(text).toContain('🖼️');
    expect(text).toContain('📁');
    expect(text).toContain('settings.libAudio');
    expect(text).toContain('settings.libVideo');
    expect(text).toContain('settings.libImage');
    expect(text).toContain('settings.libMixed');
    expect(text).toContain('settings.libUnknown');
    expect(state.library.getFolderType).toHaveBeenCalledTimes(5);
  });

  it('falls back to the folder icon for unknown types', () => {
    state.library.folders = ['C:/Music'];
    state.library.getFolderType.mockReturnValue('weird');
    setup();
    expect(wrapper!.text()).toContain('📁');
  });

  it('removes a folder after confirmation', async () => {
    state.library.folders = ['C:/Music'];
    setup();

    await buttonWithText('settings.libRemove').trigger('click');

    expect(state.prompt.showConfirm).toHaveBeenCalledWith('settings.libRemoveConfirm');
    expect(state.library.removeFolder).toHaveBeenCalledWith('C:/Music');
  });

  it('keeps the folder when the confirmation is rejected', async () => {
    state.library.folders = ['C:/Music'];
    state.prompt.showConfirm.mockResolvedValue(false);
    setup();

    await buttonWithText('settings.libRemove').trigger('click');

    expect(state.library.removeFolder).not.toHaveBeenCalled();
  });
});

describe('adding folders', () => {
  it('adds every picked folder and rescans', async () => {
    state.invoke.mockResolvedValueOnce(['C:/Music', 'D:/More']);
    setup();

    await buttonWithText('settings.libAddFolder').trigger('click');
    await flushPromises();

    expect(state.invoke).toHaveBeenCalledWith('dialog:openFolder');
    expect(state.library.addFolder.mock.calls).toEqual([['C:/Music'], ['D:/More']]);
    expect(state.library.scanFolders).toHaveBeenCalledTimes(1);
    expect(state.ui.notify).toHaveBeenCalledWith('success', 'settings.libAddedNotif');
  });

  it('does nothing when the dialog is cancelled', async () => {
    state.invoke.mockResolvedValueOnce(undefined);
    setup();
    await buttonWithText('settings.libAddFolder').trigger('click');
    expect(state.library.addFolder).not.toHaveBeenCalled();

    state.invoke.mockResolvedValueOnce([]);
    await buttonWithText('settings.libAddFolder').trigger('click');
    expect(state.library.addFolder).not.toHaveBeenCalled();
  });

  it('reports picker failures', async () => {
    state.invoke.mockRejectedValueOnce(new Error('bridge'));
    setup();

    await buttonWithText('settings.libAddFolder').trigger('click');

    expect(state.ui.notify).toHaveBeenCalledWith('error', 'settings.libAddError', 'bridge');
  });

  it('stringifies non-error failures', async () => {
    state.invoke.mockRejectedValueOnce('offline');
    setup();

    await buttonWithText('settings.libAddFolder').trigger('click');

    expect(state.ui.notify).toHaveBeenCalledWith('error', 'settings.libAddError', 'offline');
  });
});

describe('scanning', () => {
  it('starts a scan from the toolbar', async () => {
    state.library.folders = ['C:/Music'];
    setup();

    await buttonWithText('settings.libScanNow').trigger('click');

    expect(state.library.scanFolders).toHaveBeenCalledTimes(1);
  });

  it('shows progress and allows cancelling', async () => {
    state.library.folders = ['C:/Music'];
    state.library.isScanning = true;
    state.library.scanProgress = { current: 3, total: 9 };
    setup();

    expect(wrapper!.text()).toContain('settings.libScanning');
    expect(wrapper!.text()).toContain('3 / 9');
    expect(buttonWithText('settings.libScanning').attributes('disabled')).toBeDefined();

    await buttonWithText('common.cancel').trigger('click');
    expect(state.library.cancelScan).toHaveBeenCalledTimes(1);
  });

  it('summarises the library counts', () => {
    state.library.totalCount = 12;
    state.library.audioCount = 8;
    state.library.videoCount = 4;
    setup();

    const text = wrapper!.text();
    expect(text).toContain('home.statFiles: 12');
    expect(text).toContain('home.statAudio: 8');
    expect(text).toContain('home.statVideo: 4');
  });
});

describe('scan settings', () => {
  it('toggles fast scan', () => {
    setup();

    wrapper!.getComponent(SwitchStub).vm.$emit('update:modelValue', true);

    expect(state.settings.updateLibrary).toHaveBeenCalledWith({ fastScan: true });
    expect(wrapper!.find('[data-path="library.fastScan"]').exists()).toBe(true);
  });
});

describe('cover cache', () => {
  it('updates the cache size from the slider', () => {
    setup();
    const slider = wrapper!.getComponent(SliderStub);

    slider.vm.$emit('update:modelValue', 4500);

    expect(state.settings.updateLibrary).toHaveBeenCalledWith({ coverCacheMaxEntries: 4500 });
    expect(slider.props()).toMatchObject({
      modelValue: 1000,
      min: 500,
      max: 10000,
      step: 500,
      valueText: '1000'
    });
  });

  it('falls back to 2000 entries when unset', () => {
    state.settings.library.coverCacheMaxEntries = undefined;
    setup();
    const slider = wrapper!.getComponent(SliderStub);

    expect(slider.props('modelValue')).toBe(2000);
    expect(slider.props('valueText')).toBe('2000');
  });

  it('clears the cache after confirmation', async () => {
    setup();

    await buttonWithText('settings.coverCacheClear').trigger('click');

    expect(state.prompt.showConfirm).toHaveBeenCalledWith('settings.coverCacheClearConfirm');
    expect(state.invoke).toHaveBeenCalledWith('coverCache:clear');
    expect(state.ui.notify).toHaveBeenCalledWith('success', 'settings.coverCacheCleared');
  });

  it('does nothing when clearing is rejected', async () => {
    state.prompt.showConfirm.mockResolvedValue(false);
    setup();

    await buttonWithText('settings.coverCacheClear').trigger('click');

    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('reports a failed clear', async () => {
    state.invoke.mockResolvedValueOnce({ success: false, error: 'locked' });
    setup();

    await buttonWithText('settings.coverCacheClear').trigger('click');

    expect(state.ui.notify).toHaveBeenCalledWith(
      'error',
      'settings.coverCacheClearError',
      'locked'
    );
  });

  it('reports bridge failures', async () => {
    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    setup();

    await buttonWithText('settings.coverCacheClear').trigger('click');

    expect(state.ui.notify).toHaveBeenCalledWith(
      'error',
      'settings.coverCacheClearError',
      'Error: ipc'
    );
  });
});

describe('confirmation dialog', () => {
  it('binds the prompt state and forwards events', async () => {
    state.prompt.promptVisible.value = true;
    state.prompt.promptIsConfirm.value = true;
    state.prompt.promptMessage.value = 'Sure?';
    setup();

    const dialog = wrapper!.getComponent(PromptStub);
    expect(dialog.props()).toMatchObject({
      visible: true,
      isConfirm: true,
      message: 'Sure?'
    });

    await wrapper!.get('[data-testid="prompt-confirm"]').trigger('click');
    await wrapper!.get('[data-testid="prompt-cancel"]').trigger('click');
    await wrapper!.get('[data-testid="prompt-input"]').trigger('click');

    expect(state.prompt.promptConfirm).toHaveBeenCalledTimes(1);
    expect(state.prompt.promptCancel).toHaveBeenCalledTimes(1);
    expect(state.prompt.promptValue.value).toBe('typed');
  });
});
