import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, reactive } from 'vue';

const h = vi.hoisted(() => ({
  plugins: null as any,
  player: null as any,
  library: null as any,
  settings: null as any,
  handlers: {} as Record<string, (payload?: unknown) => void>,
  snapshotTrack: vi.fn((track: unknown) => ({ snapshot: track }))
}));

vi.mock('@renderer/stores/plugins', () => ({
  usePluginsStore: () => h.plugins,
  snapshotTrack: h.snapshotTrack
}));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => h.library }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));
vi.mock('@renderer/utils/audioEvents', () => ({
  audioEvents: {
    on: (name: string, fn: (payload?: unknown) => void) => {
      h.handlers[name] = fn;
    }
  }
}));

import { usePluginsHooks } from '../usePluginsHooks';

function mountHooks() {
  const Host = defineComponent({
    setup() {
      usePluginsHooks();
      return () => null;
    }
  });
  return mount(Host);
}

beforeEach(() => {
  h.handlers = {};
  h.player = reactive({
    currentTrack: { path: '/a.mp3', name: 'A' },
    queue: [],
    duration: 100,
    progress: 10,
    isPlaying: true
  });
  h.library = reactive({ isScanning: false, tracks: [{}, {}] });
  h.settings = { playback: { playbackSpeed: 1.5 } };
  h.plugins = { emitHook: vi.fn() };
  h.snapshotTrack
    .mockClear()
    .mockImplementation(((track: unknown) => (track ? { snapshot: track } : null)) as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePluginsHooks', () => {
  it('emits track:play when the current track changes', async () => {
    mountHooks();
    h.player.currentTrack = { path: '/b.mp3', name: 'B' };
    await nextTick();

    expect(h.plugins.emitHook).toHaveBeenCalledWith('track:play', {
      snapshot: expect.objectContaining({ path: '/b.mp3' })
    });
  });

  it('ignores a cleared track', async () => {
    mountHooks();
    h.player.currentTrack = null;
    await nextTick();

    expect(h.plugins.emitHook).not.toHaveBeenCalledWith('track:play', expect.anything());
  });

  it('emits track:queued when the queue grows', async () => {
    mountHooks();
    h.player.queue.push({ path: '/q.mp3', name: 'Q' });
    await nextTick();

    expect(h.plugins.emitHook).toHaveBeenCalledWith('track:queued', {
      snapshot: expect.objectContaining({ path: '/q.mp3' })
    });
  });

  it('ignores queue removals', async () => {
    h.player.queue = [{ path: '/a' }, { path: '/b' }];
    mountHooks();
    h.player.queue.pop();
    await nextTick();

    expect(h.plugins.emitHook).not.toHaveBeenCalledWith('track:queued', expect.anything());
  });

  it('emits library:scan when a scan finishes', async () => {
    h.library.isScanning = true;
    mountHooks();
    h.library.isScanning = false;
    await nextTick();

    expect(h.plugins.emitHook).toHaveBeenCalledWith('library:scan', { count: 2 });
  });

  it('does not emit while a scan starts or stays running', async () => {
    mountHooks();
    h.library.isScanning = true;
    await nextTick();
    h.library.isScanning = true;
    await nextTick();

    expect(h.plugins.emitHook).not.toHaveBeenCalledWith('library:scan', expect.anything());
  });

  it('emits track:end from audio events', () => {
    mountHooks();

    h.handlers.trackEnd();

    expect(h.plugins.emitHook).toHaveBeenCalledWith('track:end', {
      snapshot: expect.objectContaining({ path: '/a.mp3' })
    });
  });

  it('throttles time updates to roughly once per second', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    mountHooks();

    h.handlers.timeUpdate(5);
    h.handlers.timeUpdate(6);
    expect(h.plugins.emitHook).toHaveBeenCalledTimes(1);

    vi.setSystemTime(2200);
    h.handlers.timeUpdate(7);

    expect(h.plugins.emitHook).toHaveBeenCalledTimes(2);
    expect(h.plugins.emitHook).toHaveBeenLastCalledWith('track:timeupdate', {
      position: 7,
      duration: 100,
      progress: 10,
      rate: 1.5,
      playing: true,
      track: { snapshot: expect.objectContaining({ path: '/a.mp3' }) }
    });
  });

  it('tolerates a missing current track in payloads', () => {
    h.player.currentTrack = null;
    mountHooks();

    h.handlers.trackEnd();

    expect(h.plugins.emitHook).toHaveBeenCalledWith('track:end', {});
  });
});
