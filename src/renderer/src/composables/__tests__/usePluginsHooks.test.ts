import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePluginsHooks } from '../usePluginsHooks';
import { usePlayerStore } from '@renderer/stores/player';
import { useLibraryStore } from '@renderer/stores/library';
import { usePluginsStore } from '@renderer/stores/plugins';
import { audioEvents } from '@renderer/utils/audioEvents';
import type { MediaFile } from '@renderer/types/media';

const TRACK: MediaFile = {
  id: '1',
  name: 'Track',
  path: '/music/1.mp3',
  extension: '.mp3',
  mimeType: 'audio/mpeg',
  size: 1,
  addedAt: 0,
  playCount: 0,
  type: 'audio',
  metadata: { title: 'Title', artist: 'Artist' }
};

function apiMock(): void {
  const api = (window as unknown as Record<string, Record<string, unknown>>).api;
  api.pluginsList = vi.fn().mockResolvedValue([]);
  api.pluginsListExamples = vi.fn().mockResolvedValue([]);
  api.pluginsGet = vi.fn().mockResolvedValue({ success: true, code: '' });
  api.pluginsToggle = vi.fn().mockResolvedValue(true);
  api.pluginsUninstall = vi.fn().mockResolvedValue({ success: true });
  api.pluginsSettingsGet = vi.fn().mockResolvedValue({});
  api.pluginsSettingsSet = vi.fn().mockResolvedValue(true);
  api.pluginsStorageKeys = vi.fn().mockResolvedValue([]);
  api.pluginsStorageGet = vi.fn().mockResolvedValue(null);
  api.pluginsStorageSet = vi.fn().mockResolvedValue(true);
  api.pluginsStorageRemove = vi.fn().mockResolvedValue(true);
}

describe('usePluginsHooks — track:timeupdate', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    apiMock();
    useLibraryStore();
  });

  afterEach(() => {
    audioEvents.clear();
    vi.useRealTimers();
  });

  it('emits a throttled timeupdate payload with the track snapshot', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const player = usePlayerStore();
    player.setTrack(TRACK);
    player.currentTime = 5;
    player.duration = 200;
    const store = usePluginsStore();
    const emitHook = vi.spyOn(store, 'emitHook');
    usePluginsHooks();

    audioEvents.emit('timeUpdate', 5);
    expect(emitHook).toHaveBeenCalledTimes(1);
    expect(emitHook).toHaveBeenCalledWith('track:timeupdate', {
      position: 5,
      duration: 200,
      progress: 0.025,
      rate: 1,
      playing: true,
      track: expect.objectContaining({ title: 'Title' })
    });

    // Aktualizacje poniżej sekundy są odrzucane (element audio odpala ~4x na sekundę).
    audioEvents.emit('timeUpdate', 5.2);
    audioEvents.emit('timeUpdate', 5.4);
    expect(emitHook).toHaveBeenCalledTimes(1);

    vi.setSystemTime(1_001_500);
    audioEvents.emit('timeUpdate', 6);
    expect(emitHook).toHaveBeenCalledTimes(2);
  });
});
