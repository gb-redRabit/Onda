import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { Disc3, Film, Music2, Play } from '@lucide/vue';

const state = vi.hoisted(() => ({
  getCover: vi.fn(),
  getCoverStill: vi.fn(),
  loadCover: vi.fn(),
  loadCoverStill: vi.fn(),
  coverRef: null as any,
  ioCallback: null as
    ((entries: Array<{ target: Element; isIntersecting: boolean }>) => void) | null,
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}));

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state }));
vi.mock('@renderer/utils/mediaUrl', () => ({
  toMediaServerUrl: (path: string) => `media://${path}`
}));

async function load() {
  return import('../MediaCover.vue');
}

interface Mounted {
  wrapper: VueWrapper;
  unmount: () => void;
}

async function mountCover(props: Record<string, unknown> = {}): Promise<Mounted> {
  const component = await load();
  const wrapper = mount(component.default, { props: props as never });
  return { wrapper, unmount: () => wrapper.unmount() };
}

function installObserver() {
  state.ioCallback = null;
  state.observe = vi.fn();
  state.unobserve = vi.fn();
  state.disconnect = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: typeof state.ioCallback) {
        state.ioCallback = callback;
      }
      observe = state.observe;
      unobserve = state.unobserve;
      disconnect = state.disconnect;
    }
  );
}

let current: Mounted | null = null;

beforeAll(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
});

beforeEach(() => {
  vi.resetModules();
  state.getCover.mockReset();
  state.coverRef = ref({ type: null, data: null });
  state.getCover.mockImplementation(() => state.coverRef.value);
  state.getCoverStill.mockReset();
  state.getCoverStill.mockReturnValue(null);
  state.loadCover.mockReset();
  state.loadCoverStill.mockReset();
  state.ioCallback = null;
  (HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>).mockClear();
  (HTMLMediaElement.prototype.pause as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => {
  current?.unmount();
  current = null;
  vi.unstubAllGlobals();
});

describe('fallback icons', () => {
  it('uses the requested fallback glyph', async () => {
    const cases = [
      ['play', Play],
      ['disc', Disc3],
      ['film', Film],
      ['music', Music2]
    ] as const;

    for (const [fallback, icon] of cases) {
      current?.unmount();
      current = await mountCover({ fallback, size: 100 });
      expect(current.wrapper.findComponent(icon).exists()).toBe(true);
      expect(current.wrapper.find('img').exists()).toBe(false);
      expect(current.wrapper.find('video').exists()).toBe(false);
    }
  });

  it('scales the icon but keeps a minimum size', async () => {
    current = await mountCover({ fallback: 'disc', size: 100 });
    expect(current.wrapper.findComponent(Disc3).attributes('width')).toBe('35');

    current.unmount();
    current = await mountCover({ fallback: 'disc', size: 10 });
    expect(current.wrapper.findComponent(Disc3).attributes('width')).toBe('12');
  });

  it('does not observe anything without a path', async () => {
    installObserver();
    current = await mountCover();
    await nextTick();

    expect(state.observe).not.toHaveBeenCalled();
    expect(state.getCover).not.toHaveBeenCalled();
  });
});

describe('covers', () => {
  it('renders a provided image cover without loading', async () => {
    current = await mountCover({
      path: 'D:/media/a.mp3',
      cover: { type: 'image', data: 'data:image/png;base64,AAA' }
    });
    await nextTick();

    expect(current.wrapper.get('img').attributes('src')).toBe('data:image/png;base64,AAA');
    expect(state.getCover).not.toHaveBeenCalled();
    expect(state.loadCover).not.toHaveBeenCalled();
  });

  it('streams a provided video cover through the media server', async () => {
    current = await mountCover({
      path: 'D:/media/a.mp3',
      cover: { type: 'video', data: 'D:/media/a.mp4' },
      autoplay: true
    });
    await nextTick();

    const video = current.wrapper.get('video');
    expect(video.attributes('src')).toBe('media://D:/media/a.mp4');
    expect(video.attributes('autoplay')).toBeDefined();
    expect(video.classes()).toContain('opacity-100');
  });

  it('detects video covers by extension', async () => {
    state.getCover.mockReturnValue({ type: 'image', data: 'C:\\media\\Clip.MP4' });
    current = await mountCover({ path: 'D:/media/a.mp3' });
    await nextTick();

    expect(current.wrapper.get('video').attributes('src')).toBe('media://C:\\media\\Clip.MP4');
  });

  it('treats absolute unix extensions as video too', async () => {
    state.getCover.mockReturnValue({ type: 'image', data: '/media/clip.webm' });
    current = await mountCover({ path: 'D:/media/a.mp3' });
    await nextTick();

    expect(current.wrapper.find('video').exists()).toBe(true);
  });

  it('keeps relative paths as images', async () => {
    state.getCover.mockReturnValue({ type: 'image', data: 'assets/clip.mp4' });
    current = await mountCover({ path: 'D:/media/a.mp3' });
    await nextTick();

    expect(current.wrapper.find('video').exists()).toBe(false);
    expect(current.wrapper.get('img').attributes('src')).toBe('assets/clip.mp4');
  });
});

describe('loading', () => {
  it('loads immediately when no observer exists', async () => {
    current = await mountCover({ path: 'D:/media/a.mp3' });
    await nextTick();

    expect(state.loadCover).toHaveBeenCalledWith('D:/media/a.mp3');
    expect(state.getCover).toHaveBeenCalled();
  });

  it('skips the request when the cover is cached', async () => {
    state.getCover.mockReturnValue({ type: 'image', data: 'data:image/png;base64,AAA' });
    current = await mountCover({ path: 'D:/media/a.mp3' });
    await nextTick();

    expect(state.loadCover).not.toHaveBeenCalled();
    expect(current.wrapper.get('img').attributes('src')).toBe('data:image/png;base64,AAA');
  });

  it('waits for intersection before loading and mounting video', async () => {
    installObserver();
    current = await mountCover({ path: 'D:/media/a.mp3' });
    await nextTick();

    expect(state.observe).toHaveBeenCalledTimes(1);
    expect(current.wrapper.find('video').exists()).toBe(false);

    state.ioCallback!([{ target: current.wrapper.element, isIntersecting: false }]);
    await nextTick();
    expect(state.loadCover).not.toHaveBeenCalled();
    expect(current.wrapper.find('video').exists()).toBe(false);

    state.ioCallback!([{ target: current.wrapper.element, isIntersecting: true }]);
    await nextTick();
    expect(state.loadCover).toHaveBeenCalledWith('D:/media/a.mp3');

    state.coverRef.value = { type: 'video', data: 'D:/media/a.mp4' };
    await nextTick();
    expect(current.wrapper.find('video').exists()).toBe(true);
  });

  it('does not re-request a cover that arrived before intersection', async () => {
    installObserver();
    state.getCover.mockReturnValue({ type: 'image', data: 'data:image/png;base64,AAA' });
    current = await mountCover({ path: 'D:/media/a.mp3' });
    await nextTick();

    state.ioCallback!([{ target: current.wrapper.element, isIntersecting: true }]);
    await nextTick();

    expect(state.loadCover).not.toHaveBeenCalled();
  });

  it('unobserves the element on unmount', async () => {
    installObserver();
    current = await mountCover({ path: 'D:/media/a.mp3' });
    await nextTick();

    state.ioCallback!([{ target: current.wrapper.element, isIntersecting: true }]);
    await nextTick();
    current.unmount();
    current = null;

    expect(state.unobserve).toHaveBeenCalledTimes(1);
  });
});

describe('still frames', () => {
  it('requests a frame for cached video covers', async () => {
    state.getCover.mockReturnValue({ type: 'video', data: 'D:/media/a.mp4' });
    current = await mountCover({ path: 'D:/media/a.mp3', still: true });
    await nextTick();

    expect(state.loadCoverStill).toHaveBeenCalledWith('D:/media/a.mp3', 'D:/media/a.mp4');
  });

  it('falls back to the provided cover path', async () => {
    current = await mountCover({ path: 'D:/media/a.mp3', still: true });
    await nextTick();

    await current.wrapper.setProps({ cover: { type: 'video', data: 'D:/media/b.mp4' } });
    await nextTick();

    expect(state.loadCoverStill).toHaveBeenCalledWith('D:/media/a.mp3', 'D:/media/b.mp4');
  });

  it('does not request a frame when one is cached', async () => {
    state.getCoverStill.mockReturnValue({ type: 'image', data: 'data:image/jpeg;base64,STILL' });
    current = await mountCover({ path: 'D:/media/a.mp3', still: true });
    await nextTick();

    expect(state.loadCoverStill).not.toHaveBeenCalled();
    expect(current.wrapper.get('img').attributes('src')).toBe('data:image/jpeg;base64,STILL');
  });

  it('requests a frame when the cover type arrives asynchronously', async () => {
    current = await mountCover({ path: 'D:/media/a.mp3', still: true });
    await nextTick();

    await current.wrapper.setProps({ cover: { type: 'video', data: 'D:/media/a.mp4' } });
    await nextTick();

    expect(state.loadCoverStill).toHaveBeenCalledWith('D:/media/a.mp3', 'D:/media/a.mp4');
  });
});

describe('path changes', () => {
  it('loads a new uncached path while in view', async () => {
    current = await mountCover({ path: 'D:/media/a.mp3' });
    await nextTick();
    state.loadCover.mockClear();

    await current.wrapper.setProps({ path: 'D:/media/b.mp3' });
    await nextTick();

    expect(state.loadCover).toHaveBeenCalledWith('D:/media/b.mp3');
  });

  it('uses the cache for the new path', async () => {
    current = await mountCover({ path: 'D:/media/a.mp3' });
    await nextTick();
    state.loadCover.mockClear();
    state.getCover.mockReturnValue({ type: 'image', data: 'data:image/png;base64,BBB' });

    await current.wrapper.setProps({ path: 'D:/media/b.mp3' });
    await nextTick();

    expect(state.loadCover).not.toHaveBeenCalled();
    expect(current.wrapper.get('img').attributes('src')).toBe('data:image/png;base64,BBB');
  });

  it('ignores path changes when a cover is supplied', async () => {
    current = await mountCover({
      path: 'D:/media/a.mp3',
      cover: { type: 'image', data: 'data:image/png;base64,AAA' }
    });
    await nextTick();
    state.loadCover.mockClear();

    await current.wrapper.setProps({ path: '' });
    await nextTick();

    expect(state.loadCover).not.toHaveBeenCalled();
  });
});

describe('playback', () => {
  it('plays and pauses with autoplay changes', async () => {
    current = await mountCover({
      path: 'D:/media/a.mp3',
      cover: { type: 'video', data: 'D:/media/a.mp4' },
      autoplay: true
    });
    await nextTick();

    await current.wrapper.setProps({ autoplay: false });
    await nextTick();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();

    (HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>).mockClear();
    await current.wrapper.setProps({ autoplay: true });
    await nextTick();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('starts the still cover on hover', async () => {
    current = await mountCover({
      path: 'D:/media/a.mp3',
      still: true,
      cover: { type: 'video', data: 'D:/media/a.mp4' }
    });
    await nextTick();

    await current.wrapper.trigger('mouseenter');
    await nextTick();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(current.wrapper.find('video').exists()).toBe(true);

    await current.wrapper.trigger('mouseleave');
    await nextTick();
    expect(current.wrapper.find('video').exists()).toBe(false);
  });

  it('restarts a looped video when it ends', async () => {
    current = await mountCover({
      path: 'D:/media/a.mp3',
      cover: { type: 'video', data: 'D:/media/a.mp4' }
    });
    await nextTick();

    const video = current.wrapper.get('video').element as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 12 });
    (HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>).mockClear();

    await current.wrapper.get('video').trigger('ended');

    expect(video.currentTime).toBe(0);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('fades the video in after the first frame and resets on leave', async () => {
    current = await mountCover({
      path: 'D:/media/a.mp3',
      still: true,
      cover: { type: 'video', data: 'D:/media/a.mp4' }
    });
    await nextTick();

    await current.wrapper.trigger('mouseenter');
    await nextTick();
    expect(current.wrapper.get('video').classes()).toContain('opacity-0');

    await current.wrapper.get('video').trigger('loadeddata');
    await nextTick();
    expect(current.wrapper.get('video').classes()).toContain('opacity-100');

    await current.wrapper.trigger('mouseleave');
    await nextTick();
    expect(current.wrapper.find('video').exists()).toBe(false);

    await current.wrapper.trigger('mouseenter');
    await nextTick();
    expect(current.wrapper.get('video').classes()).toContain('opacity-0');
  });
});
