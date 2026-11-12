import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  invoke: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));

import OutputFolderSection from '../OutputFolderSection.vue';

const InputStub = defineComponent({
  name: 'UiInput',
  props: ['modelValue', 'readonly', 'placeholder'],
  emits: ['update:modelValue'],
  template: '<input data-testid="output-input" :value="modelValue" />'
});
const ButtonStub = defineComponent({
  name: 'UiButton',
  props: ['label', 'title', 'variant', 'size'],
  emits: ['click'],
  template: '<button data-testid="pick-folder" @click="$emit(\'click\')" />'
});
const SwitchStub = defineComponent({
  name: 'UiSwitch',
  props: ['modelValue', 'label', 'size'],
  emits: ['update:modelValue'],
  template:
    '<button class="switch" :data-label="label" @click="$emit(\'update:modelValue\', !modelValue)" />'
});

let wrapper: VueWrapper | null = null;
let originalApi: Window['api'];

function props(overrides: Record<string, unknown> = {}) {
  return {
    channelFolder: 'Channel/Sub',
    playlistFolder: 'Playlist/Sub',
    channelTitle: 'Channel',
    playlistTitle: 'Playlist',
    folderMode: 'global',
    outputDir: '',
    ...overrides
  };
}

function mountSection(overrides: Record<string, unknown> = {}) {
  wrapper = mount(OutputFolderSection, {
    props: props(overrides) as never,
    global: {
      stubs: { Input: InputStub, Button: ButtonStub, Switch: SwitchStub }
    }
  });
  return wrapper;
}

function switchFor(label: string) {
  return wrapper!.find(`[data-label="${label}"]`);
}

beforeEach(() => {
  originalApi = window.api;
  h.invoke.mockReset().mockResolvedValue([]);
  window.api = { ...originalApi, invoke: h.invoke } as Window['api'];
  h.t.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  window.api = originalApi;
});

describe('modes', () => {
  it('shows the global hint in global mode', () => {
    mountSection();

    expect(wrapper!.text()).toContain('youtube.prefOutputDirGlobal');
    expect(wrapper!.find('[data-testid="output-input"]').exists()).toBe(false);
  });

  it('offers channel and playlist switches when titles exist', () => {
    mountSection();

    expect(switchFor('youtube.prefOutputDirChannel').exists()).toBe(true);
    expect(switchFor('youtube.folderModePlaylist').exists()).toBe(true);
  });

  it('hides optional switches without titles', () => {
    mountSection({ channelTitle: '', playlistTitle: '' });

    expect(switchFor('youtube.prefOutputDirChannel').exists()).toBe(false);
    expect(switchFor('youtube.folderModePlaylist').exists()).toBe(false);
  });

  it('shows channel and playlist folder hints in their modes', async () => {
    mountSection({ folderMode: 'channel' });
    expect(wrapper!.text()).toContain('youtube.prefOutputDirChannelHint');
    expect(wrapper!.html()).toContain('Channel/Sub');

    wrapper!.unmount();
    mountSection({ folderMode: 'playlist' });
    expect(wrapper!.text()).toContain('youtube.folderModePlaylistHint');
    expect(wrapper!.html()).toContain('Playlist/Sub');
  });

  it('omits the playlist hint when no folder is known', () => {
    mountSection({ folderMode: 'playlist', playlistFolder: '' });

    expect(wrapper!.text()).not.toContain('youtube.folderModePlaylistHint');
  });

  it('switches modes through the toggles', async () => {
    mountSection();

    await switchFor('youtube.prefOutputDirCustom').trigger('click');
    expect(wrapper!.emitted('update:folderMode')).toEqual([['custom']]);

    await switchFor('youtube.prefOutputDirChannel').trigger('click');
    expect(wrapper!.emitted('update:folderMode')).toHaveLength(2);

    await switchFor('youtube.folderModePlaylist').trigger('click');
    expect(wrapper!.emitted('update:folderMode')).toHaveLength(3);
  });

  it('turns a mode off back to global', async () => {
    mountSection({ folderMode: 'custom' });

    await switchFor('youtube.prefOutputDirCustom').trigger('click');

    expect(wrapper!.emitted('update:folderMode')).toEqual([['global']]);
  });

  it('turns channel and playlist modes off', async () => {
    mountSection({ folderMode: 'channel' });
    await switchFor('youtube.prefOutputDirChannel').trigger('click');

    wrapper!.unmount();
    mountSection({ folderMode: 'playlist' });
    await switchFor('youtube.folderModePlaylist').trigger('click');

    expect(wrapper!.emitted('update:folderMode')).toEqual([['global']]);
  });
});

describe('custom folder', () => {
  it('shows the input and folder picker only in custom mode', () => {
    mountSection({ folderMode: 'custom', outputDir: 'D:/Out' });

    expect(wrapper!.get('[data-testid="output-input"]').attributes('value')).toBe('D:/Out');
    expect(wrapper!.find('[data-testid="pick-folder"]').exists()).toBe(true);
  });

  it('uses the selected folder from the dialog', async () => {
    h.invoke.mockResolvedValue(['E:/Picked']);
    mountSection({ folderMode: 'custom' });

    await wrapper!.get('[data-testid="pick-folder"]').trigger('click');

    expect(h.invoke).toHaveBeenCalledWith('dialog:openFolder');
    expect(wrapper!.emitted('update:outputDir')).toEqual([['E:/Picked']]);
  });

  it('keeps the current folder when the dialog is cancelled', async () => {
    h.invoke.mockResolvedValue([]);
    mountSection({ folderMode: 'custom' });

    await wrapper!.get('[data-testid="pick-folder"]').trigger('click');

    expect(wrapper!.emitted('update:outputDir')).toBeUndefined();
  });

  it('forwards manual edits from the input', () => {
    mountSection({ folderMode: 'custom' });

    wrapper!.findComponent(InputStub).vm.$emit('update:modelValue', 'F:/Typed');

    expect(wrapper!.emitted('update:outputDir')).toEqual([['F:/Typed']]);
  });
});
