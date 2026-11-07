import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import DownloadConfigDialog from '../DownloadConfigDialog.vue';

const state = vi.hoisted(() => ({
  form: null as any,
  notify: vi.fn(),
  invoke: vi.fn(),
  t: vi.fn((key: string) => key),
  settings: null as any,
  config: { kind: 'audio' } as any
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: state.notify }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/composables/useDownloadConfigForm', () => ({
  useDownloadConfigForm: () => state.form
}));

const ModalStub = {
  props: ['labelledBy', 'backdrop', 'panelClass'],
  emits: ['close', 'escape'],
  template: '<div><slot /></div>'
};
const ButtonStub = {
  props: ['variant', 'size', 'label', 'title', 'disabled'],
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :aria-label="label" @click="$emit(\'click\')"><slot /></button>'
};
const SegmentedStub = {
  props: ['modelValue', 'options', 'label'],
  emits: ['update:modelValue'],
  template: '<div data-testid="segmented" />'
};
const ProfilesStub = {
  props: ['profileName', 'isSc', 'profiles', 'selectedId'],
  emits: ['update:profileName', 'select', 'save', 'delete'],
  template: '<div data-testid="profiles" />'
};
const FilenameStub = {
  props: ['filenameTemplate', 'preview'],
  emits: ['update:filenameTemplate'],
  template: '<div data-testid="filename" />'
};
const OutputStub = {
  props: [
    'folderMode',
    'outputDir',
    'channelTitle',
    'playlistTitle',
    'channelFolder',
    'playlistFolder'
  ],
  emits: ['update:folderMode', 'update:outputDir'],
  template: '<div data-testid="output" />'
};
const SimpleStub = { template: '<div />' };

let wrapper: VueWrapper | null = null;

function formRefs() {
  return {
    isSc: ref(false),
    isGeneric: ref(false),
    profiles: ref([{ id: 'p1', name: 'Profile' }]),
    systemDownloads: ref('C:/old'),
    kind: ref<'audio' | 'video'>('audio'),
    format: ref('mp3'),
    quality: ref('best'),
    audioQuality: ref(''),
    videoContainer: ref('mp4'),
    audioLanguage: ref(''),
    sponsorBlock: ref('off'),
    trimStart: ref<number | undefined>(undefined),
    trimEnd: ref<number | undefined>(undefined),
    filenameTemplate: ref('{title}'),
    coverType: ref('thumbnail'),
    customPath: ref(''),
    frameTime: ref(0),
    clipStart: ref(0),
    clipEnd: ref(0),
    clipFormat: ref('video'),
    artist: ref(''),
    album: ref(''),
    year: ref(''),
    folderMode: ref('default'),
    outputDir: ref(''),
    subsEnabled: ref(false),
    subsLangs: ref(''),
    subsFormat: ref('srt'),
    subsMode: ref('best'),
    subsFolder: ref(false),
    channelFolder: ref(true),
    playlistFolder: ref(true)
  };
}

function mountDialog(props: Record<string, unknown> = {}) {
  wrapper = mount(DownloadConfigDialog, {
    props: { title: 'Video title', ...props } as never,
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        ModalShell: ModalStub,
        Button: ButtonStub,
        SegmentedControl: SegmentedStub,
        DownloadPreviewCard: SimpleStub,
        FilenameTemplateFields: FilenameStub,
        MetadataFieldsSection: SimpleStub,
        DownloadFormatSection: SimpleStub,
        CoverOptionsFields: SimpleStub,
        DownloadProfilesSection: ProfilesStub,
        DownloadOutputSection: OutputStub,
        SubscribeSubtitlesSection: SimpleStub
      }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

beforeEach(() => {
  vi.useFakeTimers();
  state.settings = { download: { defaultPath: '' } };
  state.notify.mockClear();
  state.invoke.mockReset();
  state.invoke.mockResolvedValue('C:/downloads');
  state.t.mockClear();
  state.config = { kind: 'audio', format: 'mp3' };
  state.form = {
    ...formRefs(),
    confirmConfig: vi.fn(() => state.config),
    buildConfig: vi.fn(() => state.config),
    applyProfile: vi.fn(),
    save: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    ensureLoaded: vi.fn(async () => undefined)
  };
  (window as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('header and tabs', () => {
  it('renders titles, thumbnail and the generic hint', async () => {
    state.form.isGeneric.value = true;
    mountDialog({
      thumbnail: 'https://thumb',
      channelTitle: 'Channel',
      playlistTitle: 'Playlist'
    });
    await flush();

    expect(wrapper!.text()).toContain('Video title');
    expect(wrapper!.text()).toContain('Channel');
    expect(wrapper!.text()).toContain('Playlist');
    expect(wrapper!.get('img').attributes('src')).toBe('https://thumb');
    expect(wrapper!.text()).toContain('youtube.genericExtractorHint');
  });

  it('does not duplicate the channel as a playlist', async () => {
    mountDialog({ channelTitle: 'Same', playlistTitle: 'Same' });
    await flush();
    expect(wrapper!.text()).toContain('Same');
    expect(wrapper!.text()).not.toContain('· Same');
  });

  it('exposes the two tab options and switches panels', async () => {
    mountDialog();
    await flush();
    const segmented = wrapper!.findComponent(SegmentedStub);
    expect(segmented.props('options')).toEqual([
      { value: 'format', label: 'youtube.configTabFormat' },
      { value: 'files', label: 'youtube.configTabFiles' }
    ]);
    expect(segmented.props('modelValue')).toBe('format');

    const filename = wrapper!.findComponent(FilenameStub);
    expect(filename.element.parentElement?.style.display).toBe('none');

    segmented.vm.$emit('update:modelValue', 'files');
    await flush();
    expect(filename.element.parentElement?.style.display).toBe('');
  });
});

describe('profiles', () => {
  it('applies a selected profile only for non-empty ids', async () => {
    mountDialog();
    await flush();
    const profiles = wrapper!.findComponent(ProfilesStub);

    profiles.vm.$emit('select', '');
    expect(state.form.applyProfile).not.toHaveBeenCalled();
    profiles.vm.$emit('select', 'p1');
    await flush();
    expect(state.form.applyProfile).toHaveBeenCalledWith('p1');
    expect(profiles.props('selectedId')).toBe('p1');
  });

  it('saves and clears a named profile', async () => {
    mountDialog();
    await flush();
    const profiles = wrapper!.findComponent(ProfilesStub);

    profiles.vm.$emit('update:profileName', '  ');
    profiles.vm.$emit('save');
    await flush();
    expect(state.form.save).not.toHaveBeenCalled();

    profiles.vm.$emit('update:profileName', '  My preset  ');
    profiles.vm.$emit('save');
    await flush();
    expect(state.form.save).toHaveBeenCalledWith('My preset', state.config);
    expect(profiles.props('profileName')).toBe('');
  });

  it('deletes only a selected profile', async () => {
    mountDialog();
    await flush();
    const profiles = wrapper!.findComponent(ProfilesStub);

    profiles.vm.$emit('delete');
    await flush();
    expect(state.form.remove).not.toHaveBeenCalled();

    profiles.vm.$emit('select', 'p1');
    await flush();
    profiles.vm.$emit('delete');
    await flush();
    expect(state.form.remove).toHaveBeenCalledWith('p1');
  });
});

describe('filename preview', () => {
  it('expands tokens, sanitises characters and appends the extension', async () => {
    mountDialog({ channelTitle: 'Channel', playlistTitle: 'List' });
    await flush();
    const filename = wrapper!.findComponent(FilenameStub);

    state.form.filenameTemplate.value = '{artist} - {title}';
    state.form.artist.value = 'A/B';
    state.form.album.value = 'Album';
    await flush();
    expect(filename.props('preview')).toBe('A B - Video title.mp3');

    state.form.kind.value = 'video';
    state.form.videoContainer.value = 'webm';
    await flush();
    expect(filename.props('preview')).toBe('A B - Video title.webm');

    state.form.kind.value = 'audio';
    state.form.format.value = 'flac';
    await flush();
    expect(filename.props('preview')).toBe('A B - Video title.flac');
  });

  it('falls back to title, artist, album and year defaults', async () => {
    mountDialog({ title: '' });
    await flush();
    const filename = wrapper!.findComponent(FilenameStub);

    state.form.filenameTemplate.value = '{title}_{artist}_{album}_{year}_{id}';
    await flush();
    const preview = filename.props('preview') as string;
    expect(preview).toContain('Title_');
    expect(preview).toContain('Artist_');
    expect(preview).toContain('Album_');
    expect(preview).toContain(String(new Date().getFullYear()));
    expect(preview).toContain('abc123.mp3');
  });

  it('uses the explicit metadata and falls back to title when the template is empty', async () => {
    mountDialog();
    await flush();
    const filename = wrapper!.findComponent(FilenameStub);

    state.form.filenameTemplate.value = '';
    state.form.artist.value = 'Artist';
    state.form.album.value = 'Album';
    state.form.year.value = '1999';
    await flush();
    expect(filename.props('preview')).toBe('Video title.mp3');
  });
});

describe('mount loading and output', () => {
  it('loads the system downloads path when no default is configured', async () => {
    mountDialog();
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('app:getPath', 'downloads');
    expect(state.form.systemDownloads.value).toBe('C:/downloads');
    expect(state.form.ensureLoaded).toHaveBeenCalled();
  });

  it('keeps the configured path and tolerates lookup failures', async () => {
    state.settings.download.defaultPath = 'D:/downloads';
    mountDialog();
    await flush();
    expect(state.invoke).not.toHaveBeenCalled();

    wrapper!.unmount();
    state.settings.download.defaultPath = '';
    state.form = { ...formRefs(), ...state.form, systemDownloads: ref('') };
    state.invoke.mockRejectedValueOnce(new Error('no path'));
    mountDialog();
    await flush();
    expect(state.form.systemDownloads.value).toBe('');
  });

  it('passes folder settings to the output section', async () => {
    mountDialog({ channelTitle: 'Channel', playlistTitle: 'List' });
    await flush();
    const output = wrapper!.findComponent(OutputStub);
    expect(output.props('channelTitle')).toBe('Channel');
    expect(output.props('playlistTitle')).toBe('List');
    expect(output.props('channelFolder')).toBe(true);
  });
});

describe('closing and confirmation', () => {
  it('emits confirm and cancel', async () => {
    mountDialog();
    await flush();
    const buttons = wrapper!.findAll('button');

    await buttons.find((button) => button.text().includes('youtube.addToQueue'))!.trigger('click');
    expect(wrapper!.emitted('confirm')?.[0]).toEqual([state.config]);

    await buttons.find((button) => button.text().includes('youtube.cancel'))!.trigger('click');
    expect(wrapper!.emitted('cancel')).toHaveLength(1);

    await wrapper!.get('button[aria-label="common.close"]').trigger('click');
    expect(wrapper!.emitted('cancel')).toHaveLength(2);

    wrapper!.findComponent(ModalStub).vm.$emit('escape');
    expect(wrapper!.emitted('cancel')).toHaveLength(3);
  });

  it('requires a double backdrop click and resets the counter', async () => {
    mountDialog();
    await flush();
    const modal = wrapper!.findComponent(ModalStub);

    modal.vm.$emit('close');
    expect(state.notify).toHaveBeenCalledWith('info', 'common.clickAgainToClose');
    expect(wrapper!.emitted('cancel')).toBeUndefined();

    modal.vm.$emit('close');
    expect(wrapper!.emitted('cancel')).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(2000);
    modal.vm.$emit('close');
    expect(wrapper!.emitted('cancel')).toHaveLength(1);
  });
});
