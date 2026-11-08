import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';
import OnlineSearchBar from '../OnlineSearchBar.vue';

const state = vi.hoisted(() => ({
  settings: null as any,
  detectChannelPrefix: vi.fn(),
  detectPlatform: vi.fn(),
  isHttpUrl: vi.fn(),
  readSelect: vi.fn(),
  invoke: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@shared/platform', () => ({
  detectChannelPrefix: state.detectChannelPrefix,
  detectPlatform: state.detectPlatform,
  isHttpUrl: state.isHttpUrl
}));
vi.mock('@shared/constants', () => ({
  AUDIO_FORMATS: ['best', 'mp3', 'flac'],
  VIDEO_QUALITIES: ['best', '1080p', '720p'],
  VIDEO_CONTAINERS: ['mp4', 'mkv', 'webm']
}));
vi.mock('@renderer/utils/selectOptions', () => ({ readSelect: state.readSelect }));

const ButtonStub = defineComponent({
  props: ['variant', 'disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
});
const IconButtonStub = defineComponent({
  props: ['title', 'active'],
  emits: ['click'],
  template:
    '<button :data-title="title" :data-active="active" @click="$emit(\'click\')"><slot /></button>'
});

let wrapper: VueWrapper | null = null;

function mountBar(props: Record<string, unknown> = {}) {
  wrapper = mount(OnlineSearchBar, {
    props: {
      modelValue: '',
      quickOpen: false,
      ...props
    } as never,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { OnlineButton: ButtonStub, OnlineIconButton: IconButtonStub }
    }
  });
  return wrapper;
}

function input() {
  return wrapper!.get('[data-testid="online-search-input"]');
}

function submitButton() {
  return wrapper!.findAllComponents(ButtonStub)[0];
}

function badge() {
  return wrapper!.find('[data-testid="online-detect-badge"]');
}

function iconButton(title: string) {
  return wrapper!.findAllComponents(IconButtonStub).find((b) => b.props('title') === title)!;
}

beforeEach(() => {
  vi.useFakeTimers();
  state.settings = reactive({
    download: {
      defaultKind: 'audio',
      defaultAudioFormat: 'mp3',
      defaultVideoQuality: '1080p',
      defaultVideoContainer: 'mp4',
      defaultAudioQuality: 'high'
    },
    updateDownload: vi.fn()
  });
  state.detectChannelPrefix.mockReset();
  state.detectChannelPrefix.mockReturnValue(null);
  state.detectPlatform.mockReset();
  state.detectPlatform.mockReturnValue(null);
  state.isHttpUrl.mockReset();
  state.isHttpUrl.mockReturnValue(false);
  state.readSelect.mockReset();
  state.readSelect.mockImplementation((event: Event, allowed: readonly string[]) => {
    const value = (event.target as HTMLSelectElement).value;
    return allowed.includes(value) ? value : '';
  });
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(null);
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

describe('input and submit', () => {
  it('renders a globe and search label for blank input', () => {
    mountBar();
    expect(badge().exists()).toBe(false);
    expect(submitButton().props('disabled')).toBe(true);
    expect(wrapper!.text()).toContain('youtube.search');
    expect(input().attributes('placeholder')).toBe('youtube.pasteOrSearch');
  });

  it('emits model updates from typing and Enter submits', async () => {
    mountBar();
    const field = input().element as HTMLInputElement;
    field.value = 'query';
    await input().trigger('input');
    expect(wrapper!.emitted('update:modelValue')?.[0]).toEqual(['query']);

    await input().trigger('keydown', { key: 'Enter' });
    expect(wrapper!.emitted('submit')).toHaveLength(1);
  });

  it('submits on button click and disables while busy', async () => {
    mountBar({ modelValue: 'hello' });
    expect(submitButton().props('disabled')).toBe(false);
    await submitButton().vm.$emit('click');
    expect(wrapper!.emitted('submit')).toHaveLength(1);

    await wrapper!.setProps({ isResolving: true });
    expect(submitButton().props('disabled')).toBe(true);
    expect(wrapper!.text()).toContain('youtube.resolving');

    await wrapper!.setProps({ isResolving: false, isSearching: true });
    expect(submitButton().props('disabled')).toBe(true);
  });

  it('accepts dropped text', async () => {
    mountBar();
    await input().trigger('drop', {
      dataTransfer: { getData: () => '  https://a  ' }
    });
    expect(wrapper!.emitted('update:modelValue')?.[0]).toEqual(['https://a']);
    expect(wrapper!.emitted('submit')).toHaveLength(1);

    await input().trigger('drop', { dataTransfer: { getData: () => '   ' } });
    expect(wrapper!.emitted('update:modelValue')).toHaveLength(1);
  });
});

describe('provider detection', () => {
  it('debounces provider detection and shows the badge', async () => {
    state.invoke.mockResolvedValue({ id: 'mega', label: 'MEGA' });
    mountBar();
    await wrapper!.setProps({ modelValue: 'https://mega.nz/x' });
    expect(state.invoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(199);
    expect(state.invoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();

    expect(state.invoke).toHaveBeenCalledWith('providers:detect', 'https://mega.nz/x');
    expect(badge().text()).toBe('MEGA');
    expect(badge().attributes('title')).toBe('MEGA');
    expect(badge().classes()).toContain('text-primary-text');
    expect(wrapper!.text()).toContain('youtube.resolve');
  });

  it('derives short labels for unknown provider ids', async () => {
    state.invoke.mockResolvedValue({ id: 'unknown', label: 'Long Provider Name' });
    mountBar();
    await wrapper!.setProps({ modelValue: 'https://x.example' });
    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();
    expect(badge().text()).toBe('LONG PR');
  });

  it('clears detection for non-http input and failures', async () => {
    state.invoke.mockRejectedValue(new Error('ipc'));
    mountBar();
    await wrapper!.setProps({ modelValue: 'https://x.example' });
    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();
    expect(badge().exists()).toBe(false);

    state.invoke.mockResolvedValue({ id: 'mega', label: 'MEGA' });
    await wrapper!.setProps({ modelValue: 'plain text' });
    expect(badge().exists()).toBe(false);
    expect(state.invoke).toHaveBeenCalledTimes(1);
  });

  it('ignores stale provider responses', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    state.invoke.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    mountBar();
    await wrapper!.setProps({ modelValue: 'https://a.example' });
    await vi.advanceTimersByTimeAsync(200);

    await wrapper!.setProps({ modelValue: 'https://b.example' });
    await vi.advanceTimersByTimeAsync(200);
    resolvers[1]!({ id: 'zeta', label: 'Zeta Two' });
    await Promise.resolve();
    await wrapper!.vm.$nextTick();
    expect(badge().text()).toBe('ZETA TW');

    resolvers[0]!({ id: 'alpha', label: 'Alpha One' });
    await Promise.resolve();
    await wrapper!.vm.$nextTick();
    expect(badge().text()).toBe('ZETA TW');
  });

  it('clears the pending timer on unmount', async () => {
    mountBar();
    await wrapper!.setProps({ modelValue: 'https://x.example' });
    wrapper!.unmount();
    wrapper = null;
    await vi.advanceTimersByTimeAsync(500);
    expect(state.invoke).not.toHaveBeenCalled();
  });
});

describe('detection labels', () => {
  it('recognises channel prefixes', () => {
    state.detectChannelPrefix.mockReturnValue({ platform: 'youtube' });
    mountBar({ modelValue: '@channel' });
    expect(badge().text()).toBe('YT');
    expect(badge().attributes('title')).toBe('YT · youtube.kindChannel @');
    expect(badge().classes()).toContain('text-error');

    state.detectChannelPrefix.mockReturnValue({ platform: 'soundcloud' });
    wrapper!.unmount();
    mountBar({ modelValue: '$profile' });
    expect(badge().text()).toBe('SC');
    expect(badge().classes()).toContain('text-warning');
  });

  it('labels platform video, playlist and channel links', async () => {
    state.detectPlatform.mockReturnValue({ platform: 'youtube', kind: 'video' });
    mountBar({ modelValue: 'https://youtu.be/x' });
    expect(badge().text()).toBe('YT');
    expect(badge().attributes('title')).toBe('YT · youtube.kindVideo');

    state.detectPlatform.mockReturnValue({ platform: 'soundcloud', kind: 'video' });
    await wrapper!.setProps({ modelValue: 'https://soundcloud.com/x' });
    expect(badge().attributes('title')).toBe('SC · youtube.typeTrack');

    state.detectPlatform.mockReturnValue({ platform: 'youtube', kind: 'playlist' });
    await wrapper!.setProps({ modelValue: 'https://youtube.com/playlist' });
    expect(badge().attributes('title')).toBe('YT · youtube.kindPlaylist');

    state.detectPlatform.mockReturnValue({ platform: 'soundcloud', kind: 'playlist' });
    await wrapper!.setProps({ modelValue: 'https://soundcloud.com/sets/x' });
    expect(badge().attributes('title')).toBe('SC · youtube.typeSet');

    state.detectPlatform.mockReturnValue({ platform: 'youtube', kind: 'channel' });
    await wrapper!.setProps({ modelValue: 'https://youtube.com/@x' });
    expect(badge().attributes('title')).toBe('YT · youtube.kindChannel');
  });

  it('marks unknown HTTP links as web', () => {
    state.isHttpUrl.mockReturnValue(true);
    mountBar({ modelValue: 'https://unknown.example' });
    expect(badge().text()).toBe('WEB');
    expect(badge().classes()).toContain('text-info');
    expect(badge().attributes('title')).toBe('WEB · youtube.externalLink');
  });
});

describe('batch and quick settings', () => {
  it('shows the batch active state and count badge', async () => {
    mountBar({ batchOpen: true, batchCount: 3 });
    const batch = iconButton('youtube.batch');
    expect(batch.props('active')).toBe(true);
    expect(batch.text()).toContain('3');

    await wrapper!.setProps({ batchCount: 12 });
    expect(iconButton('youtube.batch').text()).toContain('9+');

    await wrapper!.setProps({ batchCount: 0 });
    expect(iconButton('youtube.batch').text()).not.toContain('9+');
  });

  it('toggles the batch panel', async () => {
    mountBar();
    iconButton('youtube.batch').vm.$emit('click');
    expect(wrapper!.emitted('toggleBatch')).toHaveLength(1);
  });

  it('toggles quick settings via the icon', async () => {
    mountBar();
    iconButton('youtube.downloadOptions').vm.$emit('click');
    expect(wrapper!.emitted('update:quickOpen')).toEqual([[true]]);
  });

  it('renders audio quick settings for the audio kind', async () => {
    mountBar({ quickOpen: true });
    expect(wrapper!.text()).toContain('youtube.quickDownload');
    expect(wrapper!.text()).toContain('youtube.prefAudio');
    expect(wrapper!.text()).toContain('youtube.prefVideo');

    const kindButtons = wrapper!
      .findAll('button')
      .filter((b) => ['youtube.prefAudio', 'youtube.prefVideo'].includes(b.text()));
    expect(kindButtons).toHaveLength(2);
    expect(kindButtons[0].classes()).toContain('bg-base-100');
    await kindButtons[1].trigger('click');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({ defaultKind: 'video' });

    const selects = wrapper!.findAll('select');
    expect(selects).toHaveLength(2);
    await selects[0].setValue('flac');
    expect(state.readSelect).toHaveBeenCalled();
    expect(state.settings.updateDownload).toHaveBeenCalledWith({ defaultAudioFormat: 'flac' });
    await selects[1].setValue('low');
  });

  it('renders video quality and container settings for video', async () => {
    state.settings.download.defaultKind = 'video';
    mountBar({ quickOpen: true });

    const selects = wrapper!.findAll('select');
    expect(selects).toHaveLength(2);
    await selects[0].setValue('720p');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({
      defaultVideoQuality: '720p'
    });
    await selects[1].setValue('mkv');
    expect(state.settings.updateDownload).toHaveBeenCalledWith({
      defaultVideoContainer: 'mkv'
    });

    expect(wrapper!.text()).toContain('best');
    expect(wrapper!.text()).toContain('mp4');
  });

  it('renders audio format and quality labels', () => {
    mountBar({ quickOpen: true });
    expect(wrapper!.text()).toContain('settings.audioNative');
    expect(wrapper!.text()).toContain('settings.audioQuality.high');
  });
});
