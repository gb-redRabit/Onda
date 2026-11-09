import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const state = vi.hoisted(() => ({
  settings: null as any
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));

const GroupStub = defineComponent({
  name: 'SettingsGroupStub',
  props: { title: String, description: String, padded: Boolean },
  template: '<section :data-title="title"><slot /></section>'
});
const RowStub = defineComponent({
  name: 'SettingsRowStub',
  props: { label: String, description: String },
  template: '<div :data-label="label"><slot /></div>'
});
const ToggleStub = defineComponent({
  name: 'SettingsToggleStub',
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  template: '<button data-testid="toggle" :data-value="String(modelValue)" />'
});
const SectionTitleStub = defineComponent({
  name: 'SettingsSectionTitleStub',
  props: { title: String },
  template: '<span data-testid="section-title">{{ title }}</span>'
});
const PresetsStub = defineComponent({
  name: 'FilenameTemplatePresetsStub',
  emits: ['preset'],
  template: '<button data-testid="preset" @click="$emit(\'preset\', \'{artist} - {title}\')" />'
});

import SettingsDownload from '../SettingsDownload.vue';

let wrapper: VueWrapper | null = null;

function setup() {
  wrapper = mount(SettingsDownload, {
    global: {
      stubs: {
        SettingsGroup: GroupStub,
        SettingsRow: RowStub,
        SettingsToggle: ToggleStub,
        SettingsSectionTitle: SectionTitleStub,
        FilenameTemplatePresets: PresetsStub
      },
      mocks: { $t: (key: string) => key }
    }
  });
  return wrapper;
}

function buttons() {
  return wrapper!.findAll('button');
}

function buttonByText(text: string) {
  return buttons().find((button) => button.text() === text)!;
}

beforeEach(() => {
  state.settings = {
    download: reactive({
      smartMode: false,
      defaultKind: 'audio',
      defaultAudioFormat: 'mp3',
      defaultAudioQuality: 'high',
      defaultVideoQuality: '1080p',
      defaultVideoContainer: 'mp4',
      defaultCover: 'thumbnail',
      defaultCoverFrameTime: 3,
      defaultCoverClipStart: 0,
      defaultCoverClipEnd: 30,
      defaultCoverClipFormat: 'webm',
      defaultSubs: false,
      defaultSubsLangs: 'pl,en',
      filenameTemplate: '{title}'
    }),
    updateDownload: vi.fn()
  };
});

describe('smart mode and default kind', () => {
  it('toggles smart mode', () => {
    setup();
    wrapper!.getComponent(ToggleStub).vm.$emit('update:modelValue', true);

    expect(state.settings.updateDownload).toHaveBeenCalledWith({ smartMode: true });
  });

  it('switches the default kind and marks the active one', async () => {
    setup();
    expect(buttonByText('youtube.prefAudio').classes()).toContain('bg-primary');

    await buttonByText('youtube.prefVideo').trigger('click');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({ defaultKind: 'video' });
  });
});

describe('audio defaults', () => {
  it('lists native and encoded formats', async () => {
    setup();

    expect(buttonByText('settings.audioNative').classes()).not.toContain('border-primary');
    expect(buttonByText('mp3').classes()).toContain('border-primary');
    expect(buttonByText('flac').text()).toBe('flac');

    await buttonByText('flac').trigger('click');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({ defaultAudioFormat: 'flac' });
  });

  it('selects a quality', async () => {
    setup();
    expect(buttonByText('settings.audioQuality.high').classes()).toContain('border-primary');

    await buttonByText('settings.audioQuality.low').trigger('click');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({ defaultAudioQuality: 'low' });
  });
});

describe('video defaults', () => {
  it('selects quality', async () => {
    setup();
    expect(buttonByText('1080p').classes()).toContain('border-primary');

    await buttonByText('720p').trigger('click');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({ defaultVideoQuality: '720p' });
  });

  it('selects a container', async () => {
    setup();
    expect(buttonByText('mp4').classes()).toContain('border-primary');

    await buttonByText('mkv').trigger('click');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({ defaultVideoContainer: 'mkv' });
  });
});

describe('cover defaults', () => {
  it('renders every cover type without extra controls', () => {
    setup();

    for (const type of ['thumbnail', 'none', 'frame', 'clip']) {
      expect(buttonByText(`settings.cover.${type}`).text()).toBe(`settings.cover.${type}`);
    }
    expect(wrapper!.find('input[type="range"]').exists()).toBe(false);
    expect(wrapper!.findAll('input[type="number"]')).toHaveLength(0);
  });

  it('shows the frame time slider for frame covers', async () => {
    state.settings.download.defaultCover = 'frame';
    setup();

    const slider = wrapper!.get('input[type="range"]');
    expect((slider.element as HTMLInputElement).value).toBe('3');
    expect(wrapper!.get('[data-testid="section-title"]').text()).toContain(
      'youtube.frameTimeLabel: 3s'
    );

    (slider.element as HTMLInputElement).value = '42';
    await slider.trigger('input');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({ defaultCoverFrameTime: 42 });
  });

  it('edits clip bounds and format', async () => {
    state.settings.download.defaultCover = 'clip';
    setup();

    const inputs = wrapper!.findAll('input[type="number"]');
    expect(inputs).toHaveLength(2);

    (inputs[0].element as HTMLInputElement).value = '12';
    await inputs[0].trigger('change');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({ defaultCoverClipStart: 12 });

    (inputs[1].element as HTMLInputElement).value = '';
    await inputs[1].trigger('change');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({ defaultCoverClipEnd: 30 });

    (inputs[1].element as HTMLInputElement).value = '45';
    await inputs[1].trigger('change');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({ defaultCoverClipEnd: 45 });

    const select = wrapper!.get('select');
    expect((select.element as HTMLSelectElement).value).toBe('webm');
    (select.element as HTMLSelectElement).value = 'mp4';
    await select.trigger('change');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({ defaultCoverClipFormat: 'mp4' });
  });

  it('switches cover types through the buttons', async () => {
    setup();
    await buttonByText('settings.cover.frame').trigger('click');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({ defaultCover: 'frame' });
  });
});

describe('subtitles', () => {
  it('hides the language input while disabled', () => {
    setup();
    expect(wrapper!.find('input[placeholder="youtube.subsLangsPlaceholder"]').exists()).toBe(false);
  });

  it('edits languages when enabled', async () => {
    state.settings.download.defaultSubs = true;
    setup();

    const input = wrapper!.get('input[placeholder="youtube.subsLangsPlaceholder"]');
    expect((input.element as HTMLInputElement).value).toBe('pl,en');

    (input.element as HTMLInputElement).value = 'de,fr';
    await input.trigger('change');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({ defaultSubsLangs: 'de,fr' });

    wrapper!.findAllComponents(ToggleStub)[1].vm.$emit('update:modelValue', false);
    expect(state.settings.updateDownload).toHaveBeenCalledWith({ defaultSubs: false });
  });
});

describe('filename template', () => {
  it('edits the template and applies presets', async () => {
    setup();
    const input = wrapper!
      .findAll('input')
      .find((candidate) => (candidate.element as HTMLInputElement).value === '{title}')!;
    expect(input).toBeTruthy();

    (input.element as HTMLInputElement).value = '{artist} - {title}';
    await input.trigger('change');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({
      filenameTemplate: '{artist} - {title}'
    });

    await wrapper!.get('[data-testid="preset"]').trigger('click');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({
      filenameTemplate: '{artist} - {title}'
    });

    expect(wrapper!.text()).toContain('settings.available');
    expect(wrapper!.text()).toContain('{title}');
  });
});
