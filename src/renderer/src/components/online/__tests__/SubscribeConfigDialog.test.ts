import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';
import SubscribeConfigDialog from '../SubscribeConfigDialog.vue';

const state = vi.hoisted(() => ({
  form: null as any,
  ui: null as any,
  settings: null as any,
  avatar: null as any,
  invoke: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/composables/useSubscribePrefsForm', () => ({
  useSubscribePrefsForm: (options: any) => {
    state.form.options = options;
    return state.form;
  }
}));
vi.mock('@renderer/composables/useRemoteImage', () => ({
  useRemoteImage: () => state.avatar
}));

const ModalStub = defineComponent({
  emits: ['close', 'escape'],
  template: '<div data-testid="modal"><slot /></div>'
});
const SummaryStub = defineComponent({
  props: ['items'],
  template: '<div data-testid="summary" />'
});
const ScopeStub = defineComponent({
  props: ['modelValue', 'isEdit'],
  emits: ['update:modelValue'],
  template: '<div data-testid="scope" />'
});
const CardStub = defineComponent({
  props: ['channel', 'isSc', 'isEdit'],
  template: '<div data-testid="channel-card" />'
});
const ProfileStub = defineComponent({
  props: ['isSc', 'profiles', 'selectedId'],
  emits: ['select'],
  template: '<div data-testid="profile" />'
});
const FormatStub = defineComponent({
  props: [
    'kind',
    'format',
    'quality',
    'audioQuality',
    'audioLanguage',
    'trimStart',
    'trimEnd',
    'sponsorBlock',
    'isSc'
  ],
  emits: [
    'update:kind',
    'update:format',
    'update:quality',
    'update:audioQuality',
    'update:audioLanguage',
    'update:trimStart',
    'update:trimEnd',
    'update:sponsorBlock'
  ],
  template: '<div data-testid="format" />'
});
const CoverStub = defineComponent({
  props: [
    'coverType',
    'customPath',
    'frameTime',
    'clipStart',
    'clipEnd',
    'clipFormat',
    'isSc',
    'kind'
  ],
  emits: [
    'update:coverType',
    'update:customPath',
    'update:frameTime',
    'update:clipStart',
    'update:clipEnd',
    'update:clipFormat'
  ],
  template: '<div data-testid="cover" />'
});
const MetadataStub = defineComponent({
  props: ['artist', 'album', 'year', 'gridClass'],
  emits: ['update:artist', 'update:album', 'update:year'],
  template: '<div data-testid="metadata" />'
});
const SubtitlesStub = defineComponent({
  props: ['subsEnabled', 'subsLangs', 'subsMode', 'subsFormat', 'subsFolder', 'isSc'],
  emits: [
    'update:subsEnabled',
    'update:subsLangs',
    'update:subsMode',
    'update:subsFormat',
    'update:subsFolder'
  ],
  template: '<div data-testid="subtitles" />'
});
const OutputStub = defineComponent({
  props: ['folderMode', 'outputDir', 'filenameTemplate', 'addToLibrary', 'channelFolder'],
  emits: [
    'update:folderMode',
    'update:outputDir',
    'update:filenameTemplate',
    'update:addToLibrary'
  ],
  template: '<div data-testid="output" />'
});

let wrapper: VueWrapper | null = null;

function mountDialog(props: Record<string, unknown> = {}) {
  wrapper = mount(SubscribeConfigDialog, {
    props: {
      channel: { channelId: 'UC1', channelTitle: 'Channel', channelThumbnail: 'thumb.jpg' },
      ...props
    } as never,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        ModalShell: ModalStub,
        SubscribePrefsSummary: SummaryStub,
        SubscribeScopeSelector: ScopeStub,
        SubscribeChannelCard: CardStub,
        SubscribeProfileSection: ProfileStub,
        SubscribeFormatSection: FormatStub,
        CoverOptionsFields: CoverStub,
        MetadataFieldsSection: MetadataStub,
        SubscribeSubtitlesSection: SubtitlesStub,
        SubscribeOutputSection: OutputStub
      }
    }
  });
  return wrapper;
}

beforeEach(() => {
  state.form = {
    options: null,
    isSc: ref(false),
    profiles: ref([{ id: 'p1', name: 'Profile' }]),
    systemDownloads: ref(''),
    selectedProfileId: ref('p1'),
    kind: ref('audio'),
    format: ref('mp3'),
    quality: ref('1080p'),
    audioQuality: ref('high'),
    audioLanguage: ref('pl'),
    coverType: ref('none'),
    customCoverPath: ref(''),
    coverFrameTime: ref(0),
    coverClipStart: ref(0),
    coverClipEnd: ref(0),
    coverClipFormat: ref('jpg'),
    filenameTemplate: ref('%title%'),
    artist: ref(''),
    album: ref(''),
    year: ref(''),
    subsEnabled: ref(false),
    subsLangs: ref(''),
    subsFormat: ref('srt'),
    subsMode: ref('manual'),
    subsFolder: ref(false),
    folderMode: ref('channel'),
    outputDir: ref(''),
    addToLibrary: ref(true),
    sponsorBlock: ref('off'),
    trimStart: ref(null),
    trimEnd: ref(null),
    downloadAll: ref(false),
    channelFolder: ref('Channel'),
    prefsSummary: ref([{ label: 'x', value: 'y' }]),
    confirmPrefs: vi.fn(() => ({ kind: 'audio' })),
    onProfileSelect: vi.fn(),
    ensureLoaded: vi.fn().mockResolvedValue(undefined)
  };
  state.ui = { notify: vi.fn() };
  state.settings = reactive({ download: { defaultPath: '' } });
  state.avatar = ref('avatar.jpg');
  state.invoke.mockReset();
  state.invoke.mockResolvedValue('C:/Downloads');
  state.t.mockClear();
  (window as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('mount and header', () => {
  it('loads the system downloads folder and form data', async () => {
    mountDialog();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.invoke).toHaveBeenCalledWith('app:getPath', 'downloads');
    expect(state.form.systemDownloads.value).toBe('C:/Downloads');
    expect(state.form.ensureLoaded).toHaveBeenCalled();
  });

  it('skips the lookup when a default path is configured', async () => {
    state.settings.download.defaultPath = 'D:/downloads';
    mountDialog();
    await Promise.resolve();
    expect(state.invoke).not.toHaveBeenCalledWith('app:getPath', 'downloads');
  });

  it('tolerates a failed download-path lookup', async () => {
    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    mountDialog();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.form.systemDownloads.value).toBe('');
  });

  it('renders create and edit titles', async () => {
    mountDialog();
    expect(wrapper!.text()).toContain('youtube.subscribeConfigTitle');
    expect(wrapper!.text()).toContain('Channel');
    expect(wrapper!.text()).toContain('youtube.subscribeAndSave');

    await wrapper!.setProps({ mode: 'edit' });
    expect(wrapper!.text()).toContain('youtube.downloadPrefs');
    expect(wrapper!.text()).toContain('common.save');
  });

  it('renders the channel avatar and falls back on error', async () => {
    mountDialog();
    const img = wrapper!.get('img');
    expect(img.attributes('src')).toBe('avatar.jpg');
    expect(img.attributes('alt')).toBe('Channel');
    await img.trigger('error');
    expect(wrapper!.find('img').exists()).toBe(false);
  });
});

describe('form wiring', () => {
  it('passes channel and platform state to the child sections', () => {
    mountDialog();
    expect(wrapper!.findComponent(CardStub).props()).toMatchObject({ isSc: false, isEdit: false });
    expect(wrapper!.findComponent(ProfileStub).props()).toMatchObject({
      isSc: false,
      profiles: state.form.profiles.value,
      selectedId: 'p1'
    });
    expect(wrapper!.findComponent(SummaryStub).props('items')).toEqual([
      { label: 'x', value: 'y' }
    ]);
  });

  it('hides metadata for SoundCloud', () => {
    state.form.isSc.value = true;
    mountDialog();
    expect(wrapper!.find('[data-testid="metadata"]').exists()).toBe(false);
  });

  it('forwards profile selection', () => {
    mountDialog();
    wrapper!.findComponent(ProfileStub).vm.$emit('select', 'p2');
    expect(state.form.onProfileSelect).toHaveBeenCalledWith('p2');
  });

  it('binds the scope toggle and format fields', async () => {
    mountDialog();
    wrapper!.findComponent(ScopeStub).vm.$emit('update:modelValue', true);
    await wrapper!.vm.$nextTick();
    expect(state.form.downloadAll.value).toBe(true);

    const format = wrapper!.findComponent(FormatStub);
    format.vm.$emit('update:kind', 'video');
    format.vm.$emit('update:format', 'mp4');
    format.vm.$emit('update:quality', '720p');
    format.vm.$emit('update:audioQuality', 'low');
    format.vm.$emit('update:audioLanguage', 'en');
    format.vm.$emit('update:trimStart', 5);
    format.vm.$emit('update:trimEnd', 9);
    format.vm.$emit('update:sponsorBlock', 'remove');
    await wrapper!.vm.$nextTick();
    expect(state.form.kind.value).toBe('video');
    expect(state.form.format.value).toBe('mp4');
    expect(state.form.quality.value).toBe('720p');
    expect(state.form.audioQuality.value).toBe('low');
    expect(state.form.audioLanguage.value).toBe('en');
    expect(state.form.trimStart.value).toBe(5);
    expect(state.form.trimEnd.value).toBe(9);
    expect(state.form.sponsorBlock.value).toBe('remove');
  });

  it('binds cover, subtitle and output fields', async () => {
    mountDialog();
    const cover = wrapper!.findComponent(CoverStub);
    cover.vm.$emit('update:coverType', 'custom');
    cover.vm.$emit('update:customPath', 'C:/cover.jpg');
    cover.vm.$emit('update:frameTime', 12);
    cover.vm.$emit('update:clipStart', 1);
    cover.vm.$emit('update:clipEnd', 2);
    cover.vm.$emit('update:clipFormat', 'png');

    const subs = wrapper!.findComponent(SubtitlesStub);
    subs.vm.$emit('update:subsEnabled', true);
    subs.vm.$emit('update:subsLangs', 'pl');
    subs.vm.$emit('update:subsMode', 'auto');
    subs.vm.$emit('update:subsFormat', 'vtt');
    subs.vm.$emit('update:subsFolder', true);

    const output = wrapper!.findComponent(OutputStub);
    output.vm.$emit('update:folderMode', 'custom');
    output.vm.$emit('update:outputDir', 'D:/out');
    output.vm.$emit('update:filenameTemplate', '%title%');
    output.vm.$emit('update:addToLibrary', false);
    await wrapper!.vm.$nextTick();

    expect(state.form.coverType.value).toBe('custom');
    expect(state.form.subsEnabled.value).toBe(true);
    expect(state.form.subsLangs.value).toBe('pl');
    expect(state.form.folderMode.value).toBe('custom');
    expect(state.form.outputDir.value).toBe('D:/out');
    expect(state.form.addToLibrary.value).toBe(false);
  });

  it('exposes the initial prefs and platform to the form', () => {
    const initialPrefs = { kind: 'video' } as any;
    mountDialog({ initialPrefs, platform: 'soundcloud' });
    expect(state.form.options.getInitialPrefs()).toMatchObject(initialPrefs);
    expect(state.form.options.getChannelTitle()).toBe('Channel');
    expect(state.form.options.getPlatform()).toBe('soundcloud');
  });
});

describe('confirm and cancel', () => {
  it('emits confirm with the computed prefs and scope', async () => {
    mountDialog();
    state.form.downloadAll.value = true;
    const save = wrapper!
      .findAll('button')
      .find((b) => b.text().includes('youtube.subscribeAndSave'))!;
    await save.trigger('click');
    expect(state.form.confirmPrefs).toHaveBeenCalled();
    expect(wrapper!.emitted('confirm')?.[0]).toEqual([
      { prefs: { kind: 'audio' }, downloadAll: true }
    ]);
  });

  it('uses save wording in edit mode', async () => {
    mountDialog({ mode: 'edit' });
    const save = wrapper!.findAll('button').find((b) => b.text().includes('common.save'))!;
    await save.trigger('click');
    expect(wrapper!.emitted('confirm')).toHaveLength(1);
  });

  it('cancels from the footer, header and Escape', async () => {
    mountDialog();
    await wrapper!
      .findAll('button')
      .find((b) => b.text() === 'youtube.cancel')!
      .trigger('click');
    expect(wrapper!.emitted('cancel')).toHaveLength(1);

    await wrapper!.get('button[aria-label="common.close"]').trigger('click');
    expect(wrapper!.emitted('cancel')).toHaveLength(2);

    wrapper!.findComponent(ModalStub).vm.$emit('escape');
    expect(wrapper!.emitted('cancel')).toHaveLength(3);
  });

  it('requires a second overlay click and resets the counter', async () => {
    vi.useFakeTimers();
    mountDialog();
    const modal = wrapper!.findComponent(ModalStub);
    modal.vm.$emit('close');
    expect(state.ui.notify).toHaveBeenCalledWith('info', 'common.clickAgainToClose');
    expect(wrapper!.emitted('cancel')).toBeUndefined();

    modal.vm.$emit('close');
    expect(wrapper!.emitted('cancel')).toHaveLength(1);

    vi.advanceTimersByTime(2000);
    modal.vm.$emit('close');
    expect(wrapper!.emitted('cancel')).toHaveLength(1);
  });
});
