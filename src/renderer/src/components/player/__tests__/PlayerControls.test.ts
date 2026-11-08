import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';
import PlayerControls from '../PlayerControls.vue';

const state = vi.hoisted(() => ({
  player: null as any,
  fx: null as any,
  ui: null as any,
  setNightMode: vi.fn(),
  preview: null as any,
  saveScreenshot: vi.fn(),
  drawImage: vi.fn(),
  toBlob: null as any,
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/audioFx', () => ({ useAudioFxStore: () => state.fx }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@renderer/composables/useAudioPlayer', () => ({
  useAudioPlayer: () => ({ setNightMode: state.setNightMode })
}));
vi.mock('@renderer/composables/useVideoPreview', () => ({
  useVideoPreview: () => state.preview
}));
vi.mock('@renderer/utils/formatters', () => ({
  formatDuration: (seconds: number) => `T${seconds}`
}));

const TransportStub = defineComponent({
  props: ['variant', 'isPlaying', 'shuffle', 'repeat', 'favorite', 'showFavorite'],
  emits: ['play-pause', 'prev', 'next', 'toggle-shuffle', 'cycle-repeat', 'toggle-favorite'],
  template: '<div data-testid="transport" />'
});
const SpeedStub = defineComponent({
  props: ['speed'],
  emits: ['set-speed'],
  template: '<div data-testid="speed" />'
});
const SubtitleStub = { template: '<div data-testid="subtitle" />' };
const FilterStub = { template: '<div data-testid="filter" />' };
const AbButtonStub = defineComponent({
  props: ['currentTime'],
  template: '<div data-testid="ab-button" />'
});
const AbMarkersStub = defineComponent({
  props: ['duration'],
  template: '<div data-testid="ab-markers" />'
});

let wrapper: VueWrapper | null = null;
let videoRef: any;

function mountControls(props: Record<string, unknown> = {}) {
  videoRef = ref(null);
  wrapper = mount(PlayerControls, {
    props: {
      showControls: true,
      speed: 1.25,
      videoRef,
      ...props
    } as never,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        TransportButtons: TransportStub,
        PlayerSpeedMenu: SpeedStub,
        SubtitleButton: SubtitleStub,
        VideoFilterDropdown: FilterStub,
        AbRepeatButton: AbButtonStub,
        AbRepeatMarkers: AbMarkersStub
      }
    }
  });
  return wrapper;
}

function installCanvas() {
  const original = document.createElement.bind(document);
  const fake = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage: state.drawImage })),
    toBlob: (callback: (blob: Blob | null) => void) => state.toBlob(callback)
  };
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') return fake as unknown as HTMLElement;
    return original(tag);
  });
  return fake;
}

function blob() {
  return {
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
  } as Blob;
}

function slider(which: 'seek' | 'volume') {
  return wrapper!.findAll('[role="slider"]')[which === 'seek' ? 0 : 1];
}

beforeEach(() => {
  state.player = reactive({
    duration: 100,
    currentTime: 50,
    isPlaying: true,
    volume: 0.5,
    isMuted: false,
    queueVisible: false,
    shuffle: false,
    repeat: 'off',
    currentTrack: { path: 'C:/media/a.mp4' },
    isFavorite: vi.fn(() => true),
    togglePlay: vi.fn(),
    prevTrack: vi.fn(),
    nextTrack: vi.fn(),
    toggleShuffle: vi.fn(),
    cycleRepeat: vi.fn(),
    toggleFavorite: vi.fn(),
    toggleQueue: vi.fn(),
    toggleMute: vi.fn()
  });
  state.fx = reactive({
    nightMode: false,
    equalizerVisible: false,
    toggleEqualizer: vi.fn()
  });
  state.ui = { notify: vi.fn() };
  state.setNightMode.mockReset();
  state.saveScreenshot.mockReset();
  state.saveScreenshot.mockResolvedValue({ success: true, path: 'C:/shots/a.png' });
  state.drawImage.mockReset();
  state.toBlob = (callback: (value: Blob | null) => void) => callback(blob());
  state.preview = {
    setHiddenVideoRef: vi.fn(),
    previewVisible: ref(false),
    previewDataUrl: ref(''),
    previewLeft: ref(0),
    previewTimeLabel: vi.fn(() => 'T12'),
    onMouseMove: vi.fn(),
    onMouseLeave: vi.fn()
  };
  state.t.mockClear();
  (window as { api?: unknown }).api = { saveScreenshot: state.saveScreenshot };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('seek bar', () => {
  it('seeks by click position', async () => {
    mountControls();
    const bar = slider('seek');
    Object.defineProperty(bar.element, 'getBoundingClientRect', {
      value: () => ({ left: 100, width: 200 })
    });
    await bar.trigger('click', { clientX: 150 });
    expect(wrapper!.emitted('seek')?.[0]).toEqual([25]);
  });

  it('seeks with the keyboard and clamps to the duration', async () => {
    mountControls();
    const bar = slider('seek');

    await bar.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper!.emitted('seek')?.[0]).toEqual([55]);
    await bar.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper!.emitted('seek')?.[1]).toEqual([45]);
    await bar.trigger('keydown', { key: 'ArrowRight', shiftKey: true });
    expect(wrapper!.emitted('seek')?.[2]).toEqual([80]);
    await bar.trigger('keydown', { key: 'PageUp' });
    expect(wrapper!.emitted('seek')?.[3]).toEqual([80]);
    await bar.trigger('keydown', { key: 'PageDown' });
    expect(wrapper!.emitted('seek')?.[4]).toEqual([20]);
    await bar.trigger('keydown', { key: 'Home' });
    expect(wrapper!.emitted('seek')?.[5]).toEqual([0]);
    await bar.trigger('keydown', { key: 'End' });
    expect(wrapper!.emitted('seek')?.[6]).toEqual([100]);
  });

  it('clamps negative and oversized seeks', async () => {
    state.player.currentTime = 2;
    mountControls();
    const bar = slider('seek');
    await bar.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper!.emitted('seek')?.[0]).toEqual([0]);

    state.player.currentTime = 99;
    await bar.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper!.emitted('seek')?.[1]).toEqual([100]);
  });

  it('ignores unrelated keys and marks handled events', async () => {
    mountControls();
    const bar = slider('seek');
    const ignored = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
    bar.element.dispatchEvent(ignored);
    expect(ignored.defaultPrevented).toBe(false);
    expect(wrapper!.emitted('seek')).toBeUndefined();

    const handled = new KeyboardEvent('keydown', { key: 'Home', cancelable: true });
    bar.element.dispatchEvent(handled);
    expect(handled.defaultPrevented).toBe(true);
  });

  it('renders progress and accessible values', () => {
    state.player.currentTime = 25;
    state.player.duration = 200;
    mountControls();
    const bar = slider('seek');
    expect(bar.attributes('aria-valuemin')).toBe('0');
    expect(bar.attributes('aria-valuemax')).toBe('200');
    expect(bar.attributes('aria-valuenow')).toBe('25');
    expect(bar.attributes('aria-valuetext')).toBe('T25 / T200');
    expect(wrapper!.html()).toContain('width: 12.5%');
  });

  it('reports zero progress without a duration', () => {
    state.player.duration = 0;
    mountControls();
    expect(wrapper!.html()).toContain('width: 0%');
  });
});

describe('video preview', () => {
  it('forwards mouse events and shows the preview image', async () => {
    state.preview.previewVisible.value = true;
    state.preview.previewDataUrl.value = 'data:image/png;base64,xxx';
    state.preview.previewLeft.value = 40;
    mountControls();

    const bar = slider('seek');
    await bar.trigger('mousemove');
    await bar.trigger('mouseleave');
    expect(state.preview.onMouseMove).toHaveBeenCalled();
    expect(state.preview.onMouseLeave).toHaveBeenCalled();

    const img = wrapper!.get('img');
    expect(img.attributes('src')).toBe('data:image/png;base64,xxx');
    expect(wrapper!.text()).toContain('T12');
  });

  it('shows the time label while no frame is ready', () => {
    state.preview.previewVisible.value = true;
    mountControls();
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.text()).toContain('T12');
  });

  it('wires the hidden video ref', () => {
    mountControls();
    expect(state.preview.setHiddenVideoRef).toHaveBeenCalled();
  });
});

describe('transport and tools', () => {
  it('forwards transport actions', () => {
    mountControls();
    const transport = wrapper!.findComponent(TransportStub);
    expect(transport.props()).toMatchObject({
      variant: 'video',
      isPlaying: true,
      favorite: true,
      showFavorite: true
    });
    transport.vm.$emit('play-pause');
    transport.vm.$emit('prev');
    transport.vm.$emit('next');
    transport.vm.$emit('toggle-shuffle');
    transport.vm.$emit('cycle-repeat');
    transport.vm.$emit('toggle-favorite');
    expect(state.player.togglePlay).toHaveBeenCalled();
    expect(state.player.prevTrack).toHaveBeenCalled();
    expect(state.player.nextTrack).toHaveBeenCalled();
    expect(state.player.toggleShuffle).toHaveBeenCalled();
    expect(state.player.cycleRepeat).toHaveBeenCalled();
    expect(state.player.toggleFavorite).toHaveBeenCalledWith('C:/media/a.mp4');
  });

  it('handles favorite with no current track', () => {
    state.player.currentTrack = null;
    mountControls();
    expect(state.player.isFavorite).toHaveBeenCalledWith('');
    wrapper!.findComponent(TransportStub).vm.$emit('toggle-favorite');
    expect(state.player.toggleFavorite).toHaveBeenCalledWith('');
  });

  it('skips backwards and forwards and changes speed', () => {
    mountControls();
    const buttons = wrapper!.findAll('button');
    buttons.find((b) => b.attributes('aria-label') === 'playerView.seekBackward')!.trigger('click');
    buttons.find((b) => b.attributes('aria-label') === 'playerView.seekForward')!.trigger('click');
    expect(wrapper!.emitted('skip')).toEqual([[-10], [10]]);

    wrapper!.findComponent(SpeedStub).vm.$emit('set-speed', 2);
    expect(wrapper!.emitted('setSpeed')?.[0]).toEqual([2]);
  });

  it('toggles night mode, equalizer, queue and mute', async () => {
    mountControls();
    await wrapper!.get('[data-night-mode]').trigger('click');
    expect(state.setNightMode).toHaveBeenCalledWith(true);

    await wrapper!.get('[data-eq-toggle]').trigger('click');
    expect(state.fx.toggleEqualizer).toHaveBeenCalled();

    const queue = wrapper!
      .findAll('button')
      .find((b) => b.attributes('aria-label') === 'common.queue')!;
    await queue.trigger('click');
    expect(state.player.toggleQueue).toHaveBeenCalled();

    const mute = wrapper!
      .findAll('button')
      .find((b) => b.attributes('aria-label') === 'common.mute')!;
    await mute.trigger('click');
    expect(state.player.toggleMute).toHaveBeenCalled();
  });

  it('reflects FX and playback state in classes', async () => {
    mountControls();
    expect(wrapper!.get('[data-night-mode]').attributes('aria-pressed')).toBe('false');

    state.fx.nightMode = true;
    state.fx.equalizerVisible = true;
    state.player.queueVisible = true;
    await wrapper!.vm.$nextTick();
    expect(wrapper!.get('[data-night-mode]').attributes('aria-pressed')).toBe('true');
    expect(wrapper!.get('[data-night-mode]').classes()).toContain('text-primary-text!');
    expect(wrapper!.get('[data-eq-toggle]').classes()).toContain('text-primary-text!');
  });

  it('hides controls when requested', () => {
    mountControls({ showControls: false });
    expect(wrapper!.find('.scrim').classes()).toContain('opacity-0');
  });
});

describe('volume slider', () => {
  it('changes volume by click position', async () => {
    mountControls();
    const bar = slider('volume');
    Object.defineProperty(bar.element, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 100 })
    });
    await bar.trigger('click', { clientX: 30 });
    expect(wrapper!.emitted('volumeChange')?.[0]).toEqual([0.3]);
  });

  it('adjusts volume with the keyboard', async () => {
    mountControls();
    const bar = slider('volume');
    await bar.trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper!.emitted('volumeChange')?.[0]).toEqual([0.55]);
    await bar.trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper!.emitted('volumeChange')?.[1]).toEqual([0.45]);
    await bar.trigger('keydown', { key: 'ArrowRight', shiftKey: true });
    expect(wrapper!.emitted('volumeChange')?.[2]).toEqual([0.6]);
    await bar.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper!.emitted('volumeChange')?.[3]).toEqual([0.45]);
    await bar.trigger('keydown', { key: 'Home' });
    expect(wrapper!.emitted('volumeChange')?.[4]).toEqual([0]);
    await bar.trigger('keydown', { key: 'End' });
    expect(wrapper!.emitted('volumeChange')?.[5]).toEqual([1]);
  });

  it('clamps volume changes', async () => {
    state.player.volume = 0.02;
    mountControls();
    const bar = slider('volume');
    await bar.trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper!.emitted('volumeChange')?.[0]).toEqual([0]);

    state.player.volume = 0.98;
    await bar.trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper!.emitted('volumeChange')?.[1]).toEqual([1]);
  });

  it('renders the volume level and muted state', async () => {
    mountControls();
    const bar = slider('volume');
    expect(bar.attributes('aria-valuenow')).toBe('50');
    expect(bar.attributes('aria-valuetext')).toBe('50%');
    expect(bar.attributes('title')).toBe('playerView.volume: 50%');

    state.player.isMuted = true;
    await wrapper!.vm.$nextTick();
    expect(wrapper!.html()).toContain('width: 0%');
  });

  it('ignores unrelated volume keys', async () => {
    mountControls();
    const bar = slider('volume');
    const event = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
    bar.element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(wrapper!.emitted('volumeChange')).toBeUndefined();
  });
});

describe('frame capture', () => {
  function prepareVideo() {
    videoRef.value = { videoWidth: 1920, videoHeight: 1080, currentTime: 12.5 };
  }

  it('saves a captured frame', async () => {
    const fake = installCanvas();
    const controls = mountControls();
    prepareVideo();
    await wrapper!.get('[data-capture-frame]').trigger('click');
    await vi.waitFor(() => expect(state.saveScreenshot).toHaveBeenCalled());

    expect(fake.width).toBe(1920);
    expect(fake.height).toBe(1080);
    expect(state.drawImage).toHaveBeenCalled();
    expect(state.saveScreenshot).toHaveBeenCalledWith('C:/media/a.mp4', [1, 2, 3], 12.5);
    expect(state.ui.notify).toHaveBeenCalledWith('success', 'player.frameSaved', 'C:/shots/a.png');
    void controls;
  });

  it('reports save failures', async () => {
    installCanvas();
    state.saveScreenshot.mockResolvedValueOnce({
      success: false,
      error: 'disk full'
    });
    mountControls();
    prepareVideo();
    await wrapper!.get('[data-capture-frame]').trigger('click');
    await vi.waitFor(() => expect(state.ui.notify).toHaveBeenCalled());
    expect(state.ui.notify).toHaveBeenCalledWith('error', 'player.frameSaveError', 'disk full');
  });

  it('reports thrown save errors', async () => {
    installCanvas();
    state.saveScreenshot.mockRejectedValueOnce(new Error('ipc'));
    mountControls();
    prepareVideo();
    await wrapper!.get('[data-capture-frame]').trigger('click');
    await vi.waitFor(() => expect(state.ui.notify).toHaveBeenCalled());
    expect(state.ui.notify).toHaveBeenCalledWith('error', 'player.frameSaveError', 'Error: ipc');
  });

  it('skips capture without a video, path or dimensions', async () => {
    installCanvas();
    mountControls();
    await wrapper!.get('[data-capture-frame]').trigger('click');

    videoRef.value = { videoWidth: 0, videoHeight: 0, currentTime: 0 };
    await wrapper!.get('[data-capture-frame]').trigger('click');

    videoRef.value = { videoWidth: 10, videoHeight: 10, currentTime: 0 };
    state.player.currentTrack = null;
    await wrapper!.get('[data-capture-frame]').trigger('click');
    expect(state.saveScreenshot).not.toHaveBeenCalled();
  });

  it('skips capture without a 2d context or blob', async () => {
    installCanvas();
    state.toBlob = (callback: (value: Blob | null) => void) => callback(null);
    mountControls();
    prepareVideo();
    await wrapper!.get('[data-capture-frame]').trigger('click');
    expect(state.saveScreenshot).not.toHaveBeenCalled();

    const original = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => null,
          toBlob: vi.fn()
        } as unknown as HTMLElement;
      }
      return original(tag);
    });
    await wrapper!.get('[data-capture-frame]').trigger('click');
    expect(state.saveScreenshot).not.toHaveBeenCalled();
  });
});
