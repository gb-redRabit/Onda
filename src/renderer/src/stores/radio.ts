import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { usePlayerStore } from './player';
import type { IpcRadioStation } from '@shared/types/ipc';
import type { MediaFile } from '@renderer/types/media';

export interface RadioStationInput {
  name: string;
  url: string;
}

export const useRadioStore = defineStore('radio', () => {
  const stations = ref<IpcRadioStation[]>([]);
  let loaded = false;
  let loading: Promise<void> | null = null;

  function ensureLoaded(): Promise<void> {
    if (loaded) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      try {
        const data = (await window.api?.radioLoad()) as { stations?: IpcRadioStation[] } | undefined;
        stations.value = data?.stations ?? [];
      } finally {
        loaded = true;
      }
    })();
    return loading;
  }

  async function persist(): Promise<void> {
    await ensureLoaded();
    // ref() values are Vue reactive proxies — structured-clone (used by
    // ipcRenderer.invoke) cannot serialize them ("An object could not be
    // cloned"), so send a plain deep copy instead.
    await window.api?.radioSave(JSON.parse(JSON.stringify(stations.value)));
  }

  // Adds stations, deduping by url. Returns the number actually added.
  async function addStations(inputs: RadioStationInput[]): Promise<number> {
    await ensureLoaded();
    const seen = new Set(stations.value.map((s) => s.url));
    const fresh = inputs.filter((i) => {
      if (!i.url || !i.name.trim()) return false;
      if (seen.has(i.url)) return false;
      seen.add(i.url);
      return true;
    });
    if (fresh.length === 0) return 0;
    const now = Date.now();
    const entries: IpcRadioStation[] = fresh.map((i, idx) => ({
      id: `radio-${now}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
      name: i.name.trim(),
      url: i.url,
      addedAt: now + idx
    }));
    stations.value = [...stations.value, ...entries];
    await persist();
    return entries.length;
  }

  async function removeStation(id: string): Promise<void> {
    await ensureLoaded();
    const before = stations.value.length;
    stations.value = stations.value.filter((s) => s.id !== id);
    if (stations.value.length !== before) await persist();
  }

  async function renameStation(id: string, name: string): Promise<void> {
    await ensureLoaded();
    const cleaned = name.trim();
    if (!cleaned) return;
    stations.value = stations.value.map((s) => (s.id === id ? { ...s, name: cleaned } : s));
    await persist();
  }

  async function moveToTop(id: string): Promise<void> {
    await ensureLoaded();
    const idx = stations.value.findIndex((s) => s.id === id);
    if (idx <= 0) return;
    const [entry] = stations.value.splice(idx, 1);
    stations.value = [entry!, ...stations.value];
    await persist();
  }

  // Live streams are plain 'stream' tracks with no duration: the player shows
  // "na żywo" and never seeks.
  function buildRadioTrack(station: IpcRadioStation): MediaFile {
    return {
      id: `radio:${station.id}`,
      name: station.name,
      path: station.url,
      extension: '',
      mimeType: 'audio/mpeg',
      size: 0,
      type: 'stream',
      addedAt: Date.now(),
      playCount: 0
    };
  }

  function playStation(station: IpcRadioStation): void {
    usePlayerStore().setTrack(buildRadioTrack(station));
  }

  const playingStationId = computed(() => {
    const track = usePlayerStore().currentTrack;
    return track?.type === 'stream' && track.id.startsWith('radio:')
      ? track.id.slice('radio:'.length)
      : null;
  });

  const isPlaying = computed(
    () => playingStationId.value !== null && usePlayerStore().isPlaying
  );

  return {
    stations,
    ensureLoaded,
    addStations,
    removeStation,
    renameStation,
    moveToTop,
    playStation,
    buildRadioTrack,
    playingStationId,
    isPlaying
  };
});