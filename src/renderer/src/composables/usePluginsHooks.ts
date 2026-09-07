import { watch } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useLibraryStore } from '@renderer/stores/library';
import { usePluginsStore, snapshotTrack, type TrackSnapshot } from '@renderer/stores/plugins';
import { audioEvents } from '@renderer/utils/audioEvents';
import type { PluginHookPayload } from '@renderer/modules/plugins/plugin-shim';

export function usePluginsHooks(): void {
  const store = usePluginsStore();
  const player = usePlayerStore();
  const library = useLibraryStore();

  const trackPayload = (track: TrackSnapshot | null): PluginHookPayload => {
    return (track ?? {}) as PluginHookPayload;
  };

  watch(
    () => player.currentTrack,
    (track, prev) => {
      if (track && track !== prev) {
        store.emitHook('track:play', trackPayload(snapshotTrack(track)));
      }
    },
    { deep: false }
  );

  watch(
    () => player.queue.length,
    (len, prevLen) => {
      if (len > prevLen && player.queue[len - 1]) {
        store.emitHook('track:queued', trackPayload(snapshotTrack(player.queue[len - 1])));
      }
    }
  );

  watch(
    () => library.isScanning,
    (scanning, was) => {
      if (!scanning && was) {
        store.emitHook('library:scan', { count: library.tracks.length });
      }
    }
  );

  audioEvents.on('trackEnd', () => {
    store.emitHook('track:end', trackPayload(snapshotTrack(player.currentTrack)));
  });
}