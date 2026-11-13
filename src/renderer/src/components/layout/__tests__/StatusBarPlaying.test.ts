import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive, ref } from 'vue';

const state = vi.hoisted(() => ({
  player: null as any,
  fx: null as any,
  audio: null as any,
  t: vi.fn((key: string, params?: { cur: number; total: number }) =>
    params ? `${key}:${params.cur}/${params.total}` : key
  )
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/audioFx', () => ({ useAudioFxStore: () => state.fx }));
vi.mock('@renderer/composables/useAudioPlayer', () => ({ useAudioPlayer: () => state.audio }));

import StatusBarPlaying from '../StatusBarPlaying.vue';

let wrapper: VueWrapper | null = null;

function track(over: Record<string, unknown> = {}) {
  return {
    path: 'D:/Music/song.flac',
    type: 'audio',
    extension: 'flac',
    metadata: {},
    ...over
  };
}

function mountPlaying() {
  wrapper = mount(StatusBarPlaying, {
    global: {
      mocks: { $t: (key: string) => key },
      directives: { activate: {} }
    }
  });
  return wrapper;
}

beforeEach(() => {
  state.player = reactive({
    streamPending: null,
    currentTrack: null,
    isPlaying: false,
    displayQueue: [],
    queueLength: 0,
    shuffle: false,
    repeat: 'none'
  });
  state.fx = reactive({ equalizerVisible: false });
  state.audio = { error: ref<string | null>(null), isLoading: ref(false) };
});

describe('status text', () => {
  it('shows a placeholder without media and opens audio', async () => {
    const local = mountPlaying();

    expect(local.text()).toBe('status.noMedia');
    await local.trigger('click');
    expect(local.emitted('open')).toEqual([['/audio']]);
  });

  it('shows the extension and sample rate for audio', () => {
    state.player.currentTrack = track({ metadata: { sampleRate: 44100 } });

    const local = mountPlaying();

    expect(local.text()).toContain('FLAC');
    expect(local.text()).toContain('44.1kHz');
  });

  it('omits the sample rate when metadata is missing', () => {
    state.player.currentTrack = track();

    const local = mountPlaying();

    expect(local.text()).toBe('FLAC');
  });

  it('uses the stream label for a normal stream', () => {
    state.player.currentTrack = track({ type: 'stream' });

    expect(mountPlaying().text()).toContain('status.streamLabel');
  });

  it('reports a stream failure', () => {
    state.player.currentTrack = track({ type: 'stream' });
    state.audio.error.value = 'stream-failed';

    expect(mountPlaying().text()).toContain('status.streamError');
  });

  it('reports a track failure', () => {
    state.player.currentTrack = track();
    state.audio.error.value = 'track-failed';

    expect(mountPlaying().text()).toContain('status.trackError');
  });

  it('reports buffering', () => {
    state.player.currentTrack = track({ type: 'stream' });
    state.audio.isLoading.value = true;

    expect(mountPlaying().text()).toContain('status.buffering');
  });

  it('shows a pending stream name', () => {
    state.player.streamPending = { name: 'Radio', type: 'stream' };

    const local = mountPlaying();

    expect(local.text()).toContain('Radio');
    expect(local.text()).toContain('status.connecting');
  });
});

describe('navigation target', () => {
  it('opens audio for music', async () => {
    state.player.currentTrack = track();
    const local = mountPlaying();

    await local.trigger('click');

    expect(local.emitted('open')).toEqual([['/audio']]);
  });

  it('opens the video player for video', async () => {
    state.player.currentTrack = track({ type: 'video' });
    const local = mountPlaying();

    await local.trigger('click');

    expect(local.emitted('open')).toEqual([['/player']]);
  });

  it('opens the video player for a pending video stream', async () => {
    state.player.streamPending = { name: 'Clip', type: 'video' };
    const local = mountPlaying();

    await local.trigger('click');

    expect(local.emitted('open')).toEqual([['/player']]);
  });

  it('opens audio for a pending audio stream', async () => {
    state.player.streamPending = { name: 'Radio', type: 'stream' };
    const local = mountPlaying();

    await local.trigger('click');

    expect(local.emitted('open')).toEqual([['/audio']]);
  });
});

describe('indicators', () => {
  it('colors the dot by playback state', async () => {
    state.player.currentTrack = track();
    const local = mountPlaying();

    expect(local.find('.bg-success').exists()).toBe(false);
    expect(local.find('.bg-base-300').exists()).toBe(true);

    state.player.isPlaying = true;
    await local.vm.$nextTick();
    expect(local.find('.bg-success').exists()).toBe(true);
  });

  it('shows shuffle, repeat and equalizer markers', () => {
    state.player.currentTrack = track();
    state.player.shuffle = true;
    state.player.repeat = 'one';
    state.fx.equalizerVisible = true;

    const local = mountPlaying();
    const titles = local.findAll('[title]').map((el) => el.attributes('title'));

    expect(titles).toContain('status.shuffle');
    expect(titles).toContain('status.repeatOne');
    expect(titles).toContain('status.eq');
  });

  it('uses the repeat-all label for a looped queue', () => {
    state.player.currentTrack = track();
    state.player.repeat = 'all';

    const titles = mountPlaying()
      .findAll('[title]')
      .map((el) => el.attributes('title'));

    expect(titles).toContain('status.repeat');
  });

  it('shows the queue position of the current track', () => {
    state.player.currentTrack = track();
    state.player.displayQueue = [{ path: 'a' }, { path: 'D:/Music/song.flac' }];
    state.player.queueLength = 5;

    const local = mountPlaying();

    expect(local.text()).toContain('status.queuePos:2/5');
    expect(state.t).toHaveBeenCalledWith('status.queuePos', { cur: 2, total: 5 });
  });

  it('hides the queue position when the track is not queued', () => {
    state.player.currentTrack = track();
    state.player.displayQueue = [{ path: 'other' }];

    const local = mountPlaying();

    expect(local.text()).not.toContain('status.queuePos');
  });
});
