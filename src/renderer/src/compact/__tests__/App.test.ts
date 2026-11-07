import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive, ref } from 'vue';
import CompactApp from '../App.vue';

const state = vi.hoisted(() => ({
  player: null as any,
  settings: null as any,
  appearance: null as any,
  audio: null as any,
  pip: null as any,
  mediaSession: null as any,
  removeMediaIpcEvents: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  handlers: {} as Record<string, (...args: unknown[]) => void>,
  unsubs: [] as Array<ReturnType<typeof vi.fn>>,
  loadLocaleMessages: vi.fn(),
  tracksFocus: vi.fn(),
  getPinned: false as boolean,
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('pinia', () => ({
  storeToRefs: () => ({ appearance: state.appearance }),
  defineStore: () => () => ({})
}));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/composables/useAudioPlayer', () => ({ useAudioPlayer: () => state.audio }));
vi.mock('@renderer/composables/useAudioPiP', () => ({ useAudioPiP: () => state.pip }));
vi.mock('@renderer/composables/useCoreSync', () => ({ useCoreSync: vi.fn() }));
vi.mock('@renderer/composables/useMediaSession', () => ({
  useMediaSession: () => state.mediaSession
}));
vi.mock('@renderer/composables/useSessionPersistence', () => ({
  useSessionPersistence: vi.fn()
}));
vi.mock('@renderer/composables/appIpc/registerMediaIpcEvents', () => ({
  registerMediaIpcEvents: () => state.removeMediaIpcEvents
}));
vi.mock('@renderer/i18n', () => ({ loadLocaleMessages: state.loadLocaleMessages }));

const MediaCoverStub = {
  name: 'MediaCover',
  props: ['path', 'size', 'autoplay'],
  template: '<div data-testid="compact-cover-stub" />'
};
const SliderStub = {
  name: 'Slider',
  props: ['modelValue', 'label', 'min', 'max', 'step', 'valueText'],
  emits: ['update:modelValue'],
  template: '<div v-bind="$attrs" />'
};
const TracksStub = {
  name: 'CompactTracks',
  methods: { focusSearch: () => state.tracksFocus() },
  template: '<div data-testid="compact-tracks" />'
};
const QueueStub = { name: 'CompactQueue', template: '<div data-testid="compact-queue" />' };
const AlbumsStub = { name: 'CompactAlbums', template: '<div data-testid="compact-albums" />' };

let wrapper: VueWrapper | null = null;

function track(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `${id}.mp3`,
    path: `C:\\music\\${id}.mp3`,
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    metadata: { title: `Title ${id}`, artist: `Artist ${id}` },
    duration: 180,
    addedAt: 0,
    playCount: 0,
    ...overrides
  } as never;
}

function mountApp() {
  wrapper = mount(CompactApp, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        MediaCover: MediaCoverStub,
        Slider: SliderStub,
        CompactTracks: TracksStub,
        CompactQueue: QueueStub,
        CompactAlbums: AlbumsStub
      }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

function key(init: KeyboardEventInit, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function progressEl(): HTMLElement {
  return wrapper!.get('[data-testid="compact-progress"]').element as HTMLElement;
}

function stubSeek(): { focus: ReturnType<typeof vi.fn>; capture: ReturnType<typeof vi.fn> } {
  const el = progressEl();
  const focus = vi.fn();
  const capture = vi.fn();
  const release = vi.fn();
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 6, right: 200, bottom: 6, x: 0, y: 0 }) as DOMRect;
  el.focus = focus;
  el.setPointerCapture = capture;
  el.releasePointerCapture = release;
  return { focus, capture };
}

beforeEach(() => {
  state.appearance = ref({
    locale: 'en',
    audioPipDock: 'bottom-right',
    audioPipAutoShow: true
  });
  state.settings = {
    appearance: state.appearance.value,
    audioPipDock: 'bottom-right'
  };
  state.player = reactive({
    currentTrack: track('a'),
    displayQueue: [track('a'), track('b')],
    repeat: 'none',
    shuffle: false,
    isPlaying: false,
    isMuted: false,
    volume: 0.6,
    toggleShuffle: vi.fn(),
    prevTrack: vi.fn(),
    nextTrack: vi.fn(),
    togglePlay: vi.fn(),
    cycleRepeat: vi.fn(),
    toggleMute: vi.fn(),
    setVolume: vi.fn()
  });
  state.audio = {
    currentTime: ref(30),
    duration: ref(180),
    error: ref<string | null>(null),
    isPlaying: ref(false),
    seek: vi.fn()
  };
  state.pip = {
    dock: ref('bottom-right'),
    setAutoShow: vi.fn(),
    show: vi.fn(async () => undefined),
    hide: vi.fn(async () => undefined)
  };
  state.mediaSession = { dispose: vi.fn() };
  state.removeMediaIpcEvents = vi.fn();
  state.handlers = {};
  state.unsubs = [];
  state.getPinned = false;
  state.invoke.mockReset();
  state.invoke.mockImplementation(async (channel: string) => {
    if (channel === 'app:getCompactPinned') return state.getPinned;
    return undefined;
  });
  state.on.mockReset();
  state.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    state.handlers[event] = cb;
    const unsub = vi.fn();
    state.unsubs.push(unsub);
    return unsub;
  });
  (window as { api?: unknown }).api = {
    invoke: state.invoke,
    on: state.on
  };
  state.loadLocaleMessages.mockClear();
  state.tracksFocus.mockClear();
  state.t.mockClear();
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('rendering', () => {
  it('shows the current track, times and queue badge', async () => {
    mountApp();
    await flush();

    expect(wrapper!.get('[data-testid="compact-title"]').text()).toBe('Title a');
    expect(wrapper!.text()).toContain('Artist a');
    expect(wrapper!.text()).toContain('0:30');
    expect(wrapper!.text()).toContain('3:00');
    expect(wrapper!.findAll('[data-testid="compact-tracks"]')).toHaveLength(1);
    expect(wrapper!.get('[data-testid="compact-queue-count"]').text()).toBe('2');
    expect(wrapper!.findComponent(MediaCoverStub).props('path')).toBe('C:\\music\\a.mp3');
  });

  it('falls back to empty labels and track duration', async () => {
    state.player.currentTrack = track('b', {
      metadata: {},
      name: 'b.mp3',
      duration: 75
    });
    state.audio.duration.value = 0;
    mountApp();
    await flush();

    expect(wrapper!.get('[data-testid="compact-title"]').text()).toBe('b.mp3');
    expect(wrapper!.text()).toContain('—');
    expect(wrapper!.text()).toContain('1:15');
  });

  it('shows the last-resort empty title', async () => {
    state.player.currentTrack = null;
    mountApp();
    await flush();
    expect(wrapper!.get('[data-testid="compact-title"]').text()).toBe('compact.nothingPlaying');
  });

  it('derives the progress width and slider aria values', async () => {
    state.audio.currentTime.value = 45;
    mountApp();
    await flush();

    const el = progressEl();
    expect(el.getAttribute('aria-valuemax')).toBe('180');
    expect(el.getAttribute('aria-valuenow')).toBe('45');
    expect(el.querySelector('.bg-primary')?.getAttribute('style')).toContain('25%');
  });

  it('shows repeat and shuffle state', async () => {
    state.player.repeat = 'all';
    state.player.shuffle = true;
    mountApp();
    await flush();

    expect(wrapper!.text()).toContain('compact.repeatAll');
    expect(wrapper!.text()).toContain('compact.shuffleOn');
    expect(wrapper!.get('[data-testid="compact-repeat"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper!.get('[data-testid="compact-shuffle"]').attributes('aria-pressed')).toBe('true');

    state.player.repeat = 'one';
    await flush();
    expect(wrapper!.text()).toContain('compact.repeatOne');
    expect(wrapper!.get('[data-testid="compact-repeat"]').attributes('aria-label')).toBe(
      'compact.repeatOne'
    );
  });

  it('handles queue badges above and at zero', async () => {
    state.player.displayQueue = Array.from({ length: 120 }, (_, i) =>
      track(`q${i}`, { type: 'audio' })
    );
    mountApp();
    await flush();
    expect(wrapper!.get('[data-testid="compact-queue-count"]').text()).toBe('99+');

    state.player.displayQueue = [track('v', { type: 'video' })];
    await flush();
    expect(wrapper!.findAll('[data-testid="compact-queue-count"]')).toHaveLength(0);
  });
});

describe('playback controls', () => {
  it('wires transport buttons to the player', async () => {
    mountApp();
    await flush();

    await wrapper!.get('[data-testid="compact-shuffle"]').trigger('click');
    await wrapper!.get('[data-testid="compact-prev"]').trigger('click');
    await wrapper!.get('[data-testid="compact-play"]').trigger('click');
    await wrapper!.get('[data-testid="compact-next"]').trigger('click');
    await wrapper!.get('[data-testid="compact-repeat"]').trigger('click');
    await wrapper!.get('[data-testid="compact-mute"]').trigger('click');

    expect(state.player.toggleShuffle).toHaveBeenCalled();
    expect(state.player.prevTrack).toHaveBeenCalled();
    expect(state.player.togglePlay).toHaveBeenCalled();
    expect(state.player.nextTrack).toHaveBeenCalled();
    expect(state.player.cycleRepeat).toHaveBeenCalled();
    expect(state.player.toggleMute).toHaveBeenCalled();
  });

  it('reflects playing and muted state on the buttons', async () => {
    state.player.isPlaying = true;
    state.player.isMuted = true;
    mountApp();
    await flush();

    expect(wrapper!.get('[data-testid="compact-play"]').attributes('data-playing')).toBe('true');
    expect(wrapper!.get('[data-testid="compact-play"]').attributes('aria-label')).toBe(
      'compact.pause'
    );
    expect(wrapper!.get('[data-testid="compact-mute"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper!.get('[data-testid="compact-mute"]').attributes('aria-label')).toBe(
      'compact.unmute'
    );
  });

  it('updates the volume through the slider', async () => {
    mountApp();
    await flush();
    wrapper!.findComponent(SliderStub).vm.$emit('update:modelValue', '0.35');
    expect(state.player.setVolume).toHaveBeenCalledWith(0.35);
  });

  it('toggles pin from the saved state', async () => {
    state.getPinned = true;
    mountApp();
    await flush();

    expect(wrapper!.get('[data-testid="compact-pin"]').attributes('aria-label')).toBe(
      'compact.unpin'
    );
    await wrapper!.get('[data-testid="compact-pin"]').trigger('click');
    expect(state.invoke).toHaveBeenCalledWith('app:setCompactPinned', false);
    expect(wrapper!.get('[data-testid="compact-pin"]').attributes('aria-label')).toBe(
      'compact.pin'
    );
  });

  it('expands and hides through the window API', async () => {
    mountApp();
    await flush();

    await wrapper!.get('[data-testid="compact-expand"]').trigger('click');
    expect(state.invoke).toHaveBeenCalledWith('app:setWindowMode', 'main');

    await wrapper!.get('[data-testid="compact-close"]').trigger('click');
    expect(state.invoke).toHaveBeenCalledWith('app:hideCompact');
  });
});

describe('seeking', () => {
  beforeEach(async () => {
    mountApp();
    await flush();
  });

  it('seeks on pointer down, move and up', async () => {
    const { focus, capture } = stubSeek();

    progressEl().dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 50, clientY: 3, bubbles: true })
    );
    expect(state.audio.seek).toHaveBeenLastCalledWith(45);
    expect(focus).toHaveBeenCalled();
    expect(capture).toHaveBeenCalled();

    progressEl().dispatchEvent(
      new MouseEvent('pointermove', { clientX: 100, clientY: 3, bubbles: true })
    );
    expect(state.audio.seek).toHaveBeenLastCalledWith(90);

    progressEl().dispatchEvent(
      new MouseEvent('pointerup', { clientX: 200, clientY: 3, bubbles: true })
    );
    expect(state.audio.seek).toHaveBeenLastCalledWith(180);
  });

  it('ignores moves when not seeking and clamps positions', async () => {
    stubSeek();
    progressEl().dispatchEvent(
      new MouseEvent('pointermove', { clientX: 100, clientY: 3, bubbles: true })
    );
    expect(state.audio.seek).not.toHaveBeenCalled();

    progressEl().dispatchEvent(
      new MouseEvent('pointerdown', { clientX: -20, clientY: 3, bubbles: true })
    );
    expect(state.audio.seek).toHaveBeenLastCalledWith(0);

    progressEl().dispatchEvent(
      new MouseEvent('pointermove', { clientX: 500, clientY: 3, bubbles: true })
    );
    expect(state.audio.seek).toHaveBeenLastCalledWith(180);

    progressEl().dispatchEvent(new MouseEvent('pointercancel', { bubbles: true }));
    state.audio.seek.mockClear();
    progressEl().dispatchEvent(
      new MouseEvent('pointermove', { clientX: 20, clientY: 3, bubbles: true })
    );
    expect(state.audio.seek).not.toHaveBeenCalled();
  });

  it('seeks with arrow keys and ignores zero-duration media', async () => {
    state.audio.currentTime.value = 10;
    await wrapper!.vm.$nextTick();
    progressEl().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    );
    expect(state.audio.seek).toHaveBeenLastCalledWith(15);

    progressEl().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })
    );
    expect(state.audio.seek).toHaveBeenLastCalledWith(5);

    state.audio.duration.value = 0;
    state.player.currentTrack = track('a', { duration: 0 });
    await wrapper!.vm.$nextTick();
    state.audio.seek.mockClear();
    progressEl().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    );
    expect(state.audio.seek).not.toHaveBeenCalled();
  });

  it('ignores pointer seeking without a duration', async () => {
    state.audio.duration.value = 0;
    state.player.currentTrack = track('a', { duration: 0 });
    await wrapper!.vm.$nextTick();
    stubSeek();
    progressEl().dispatchEvent(new MouseEvent('pointerdown', { clientX: 50, bubbles: true }));
    expect(state.audio.seek).not.toHaveBeenCalled();
  });
});

describe('global keyboard', () => {
  it('focuses search with Ctrl+F and switches to tracks', async () => {
    mountApp();
    await flush();
    await wrapper!.get('[data-testid="compact-tab-queue"]').trigger('click');

    const event = key({ key: 'f', ctrlKey: true });
    await flush();
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper!.findAll('[data-testid="compact-tracks"]')).toHaveLength(1);
    expect(state.tracksFocus).toHaveBeenCalled();
  });

  it('hides to tray on Escape', async () => {
    mountApp();
    await flush();
    key({ key: 'Escape' });
    expect(state.invoke).toHaveBeenCalledWith('app:hideCompact');
  });

  it('handles modifier navigation and space', async () => {
    mountApp();
    await flush();

    key({ key: 'ArrowLeft', ctrlKey: true });
    expect(state.player.prevTrack).toHaveBeenCalled();
    key({ key: 'ArrowRight', metaKey: true });
    expect(state.player.nextTrack).toHaveBeenCalled();
    key({ code: 'Space', key: ' ' });
    expect(state.player.togglePlay).toHaveBeenCalled();
  });

  it('seeks with plain arrows', async () => {
    mountApp();
    await flush();
    state.audio.currentTime.value = 10;
    await wrapper!.vm.$nextTick();

    key({ key: 'ArrowRight' });
    expect(state.audio.seek).toHaveBeenLastCalledWith(15);
    key({ key: 'ArrowLeft' });
    expect(state.audio.seek).toHaveBeenLastCalledWith(5);
  });

  it('ignores shortcuts from interactive targets', async () => {
    mountApp();
    await flush();
    const input = document.createElement('input');
    document.body.appendChild(input);
    key({ code: 'Space', key: ' ' }, input);
    expect(state.player.togglePlay).not.toHaveBeenCalled();

    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.appendChild(editable);
    key({ key: 'ArrowRight' }, editable);
    expect(state.audio.seek).not.toHaveBeenCalled();

    const link = document.createElement('a');
    document.body.appendChild(link);
    key({ key: 'ArrowRight' }, link);
    expect(state.audio.seek).not.toHaveBeenCalled();
  });
});

describe('tabs', () => {
  it('switches panels and supports keyboard navigation', async () => {
    mountApp();
    await flush();

    await wrapper!.get('[data-testid="compact-tab-queue"]').trigger('click');
    expect(wrapper!.findAll('[data-testid="compact-queue"]')).toHaveLength(1);

    await wrapper!.get('[data-testid="compact-tab-albums"]').trigger('click');
    expect(wrapper!.findAll('[data-testid="compact-albums"]')).toHaveLength(1);

    const tracksTab = wrapper!.get('[data-testid="compact-tab-tracks"]');
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    });
    tracksTab.element.dispatchEvent(event);
    await flush();
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper!.findAll('[data-testid="compact-queue"]')).toHaveLength(1);
    expect(document.activeElement?.id).toBe('compact-tab-queue');

    const queueTab = wrapper!.get('[data-testid="compact-tab-queue"]');
    queueTab.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })
    );
    await flush();
    expect(wrapper!.findAll('[data-testid="compact-albums"]')).toHaveLength(1);

    const albumsTab = wrapper!.get('[data-testid="compact-tab-albums"]');
    albumsTab.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })
    );
    await flush();
    expect(wrapper!.findAll('[data-testid="compact-tracks"]')).toHaveLength(1);
  });
});

describe('compact window events', () => {
  it('shows PiP on hide when auto-show and playing', async () => {
    state.audio.isPlaying.value = true;
    mountApp();
    await flush();

    state.handlers['compact:hidden'](undefined);
    expect(state.pip.show).toHaveBeenCalled();

    state.pip.show.mockClear();
    state.handlers['compact:hidden']({ autoPip: false });
    expect(state.pip.show).not.toHaveBeenCalled();

    state.appearance.value = { ...state.appearance.value, audioPipAutoShow: false };
    state.settings.appearance.audioPipAutoShow = false;
    state.handlers['compact:hidden']({});
    expect(state.pip.show).not.toHaveBeenCalled();

    state.handlers['compact:shown']();
    expect(state.pip.hide).toHaveBeenCalled();
  });

  it('applies appearance updates from the main window', async () => {
    mountApp();
    await flush();

    const next = {
      locale: 'pl',
      audioPipDock: 'left',
      audioPipAutoShow: false
    };
    state.handlers['settings:appearance'](next);

    expect(state.appearance.value).toEqual(next);
    expect(state.loadLocaleMessages).toHaveBeenCalledWith('pl');
    expect(state.pip.dock.value).toBe('left');
    expect(state.pip.setAutoShow).toHaveBeenCalledWith(false);

    state.loadLocaleMessages.mockClear();
    state.handlers['settings:appearance'](undefined);
    expect(state.loadLocaleMessages).not.toHaveBeenCalled();
  });

  it('cleans up on unmount', async () => {
    mountApp();
    await flush();
    wrapper!.unmount();
    wrapper = null;

    expect(state.mediaSession.dispose).toHaveBeenCalled();
    expect(state.removeMediaIpcEvents).toHaveBeenCalled();
    for (const unsub of state.unsubs) expect(unsub).toHaveBeenCalled();

    state.player.togglePlay.mockClear();
    key({ code: 'Space', key: ' ' });
    expect(state.player.togglePlay).not.toHaveBeenCalled();
  });
});

describe('playback errors', () => {
  it('maps track, stream and generic errors and allows dismissal', async () => {
    mountApp();
    await flush();

    state.audio.error.value = 'track-failed';
    await flush();
    expect(wrapper!.get('[data-testid="compact-playback-error"]').text()).toContain(
      'compact.trackError'
    );

    await wrapper!.get('[aria-label="compact.dismiss"]').trigger('click');
    expect(wrapper!.findAll('[data-testid="compact-playback-error"]')).toHaveLength(0);

    state.audio.error.value = 'stream-failed';
    await flush();
    expect(wrapper!.get('[data-testid="compact-playback-error"]').text()).toContain(
      'compact.streamError'
    );

    state.audio.error.value = 'other';
    await flush();
    expect(wrapper!.get('[data-testid="compact-playback-error"]').text()).toContain(
      'compact.playbackError'
    );
  });

  it('clears the dismissed error when the error or track changes', async () => {
    mountApp();
    await flush();
    state.audio.error.value = 'track-failed';
    await flush();
    await wrapper!.get('[aria-label="compact.dismiss"]').trigger('click');
    expect(wrapper!.findAll('[data-testid="compact-playback-error"]')).toHaveLength(0);

    state.player.currentTrack = track('b');
    await flush();
    expect(wrapper!.findAll('[data-testid="compact-playback-error"]')).toHaveLength(1);

    await wrapper!.get('[aria-label="compact.dismiss"]').trigger('click');
    state.audio.error.value = null;
    await flush();
    state.audio.error.value = 'track-failed';
    await flush();
    expect(wrapper!.findAll('[data-testid="compact-playback-error"]')).toHaveLength(1);
  });
});
