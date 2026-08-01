import { defineStore } from 'pinia';
import { ref, computed, triggerRef } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import type { SubtitleTrack, MkvFont } from '@renderer/types/subtitles';
import { audioEngine } from '@renderer/modules/audioEngine';
import { logger } from '@shared/logger';
import { useLibraryStore } from '@renderer/stores/library';
import { captureVideoFrame } from './player-cover';

export interface CoverResult {
  type: 'video' | 'image' | null;
  data: string | null;
}

export const usePlayerStore = defineStore('player', () => {
  const currentTrack = ref<MediaFile | null>(null);
  const queue = ref<MediaFile[]>([]);
  const history = ref<MediaFile[]>([]);
  const isPlaying = ref(false);
  const isMuted = ref(false);
  const volume = ref(0.8);
  const currentTime = ref(0);
  const duration = ref(0);
  const playbackRate = ref(1);
  const shuffle = ref(false);
  const repeat = ref<'none' | 'all' | 'one'>('none');
  const queueVisible = ref(false);
  const equalizerVisible = ref(false);
  const equalizerBands = ref<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const equalizerPreset = ref('flat');
  const pipActive = ref(false);
  const pipTime = ref(0);
  const pendingFullscreen = ref(false);
  const resumePrompt = ref<{ path: string; position: number } | null>(null);
  const pendingQueue = ref<MediaFile[]>([]);
  const coverCache = ref<Record<string, CoverResult>>({});

  const favorites = ref<string[]>([]);
  const subtitleTracks = ref<SubtitleTrack[]>([]);
  const activeSubtitleId = ref<string | null>(null);

  const hasTrack = computed(() => currentTrack.value !== null);

  let favoritesLoaded = false;
  async function ensureFavorites(): Promise<void> {
    if (favoritesLoaded) return;
    favoritesLoaded = true;
    if (!window.api) return;
    try {
      const data = (await window.api.invoke('settings:get')) as Record<string, unknown>;
      const list = data.favorites;
      if (Array.isArray(list)) favorites.value = list;
    } catch {
      /* defaults */
    }
  }

  function isFavorite(path: string): boolean {
    ensureFavorites();
    return favorites.value.includes(path);
  }

  function toggleFavorite(path: string) {
    const idx = favorites.value.indexOf(path);
    if (idx >= 0) {
      favorites.value.splice(idx, 1);
    } else {
      favorites.value.push(path);
    }
    saveFavorites();
  }

  async function saveFavorites() {
    try {
      if (window.api) {
        await window.api.invoke('settings:set', {
          favorites: favorites.value
        });
      }
    } catch {
      // silent fail
    }
  }

  const progress = computed(() => (duration.value > 0 ? currentTime.value / duration.value : 0));
  const queueLength = computed(() => queue.value.length + pendingQueue.value.length);
  const displayQueue = computed(() => [...pendingQueue.value, ...queue.value]);

  // --- play statistics (playCount / lastPlayed) ---
  let statsSaveTimer: ReturnType<typeof setTimeout> | null = null;

  function persistStats() {
    if (statsSaveTimer) return;
    statsSaveTimer = setTimeout(() => {
      statsSaveTimer = null;
      try {
        const library = useLibraryStore();
        const files = structuredClone(library.tracks);
        const folderTypes = structuredClone(library.folderTypes);
        window.api?.invoke('library:saveScanned', { files, folderTypes }).catch(() => {
          /* non-fatal */
        });
      } catch {
        /* serialization failed silently */
      }
    }, 1000);
  }

  function recordPlay(track: MediaFile) {
    if (!track?.path) return;
    const library = useLibraryStore();
    let found = false;
    library.updateTrack(track.path, (t) => {
      t.playCount = (t.playCount || 0) + 1;
      t.lastPlayed = Date.now();
      found = true;
    });
    if (found) persistStats();
  }

  function setTrack(track: MediaFile) {
    if (currentTrack.value) {
      history.value.unshift(currentTrack.value);
      if (history.value.length > 100) history.value.pop();
    }
    if (track.type === 'video') audioEngine.resume();
    currentTrack.value = track;
    currentTime.value = 0;
    pipTime.value = 0;
    if (!pipActive.value) {
      isPlaying.value = true;
    }
    recordPlay(track);
  }

  function play() {
    isPlaying.value = true;
  }
  function pause() {
    isPlaying.value = false;
  }
  function togglePlay() {
    isPlaying.value = !isPlaying.value;
  }
  function seek(time: number) {
    currentTime.value = time;
  }
  function setVolume(v: number) {
    volume.value = Math.max(0, Math.min(1, v));
  }
  function toggleMute() {
    isMuted.value = !isMuted.value;
  }
  function toggleShuffle() {
    shuffle.value = !shuffle.value;
  }

  function cycleRepeat() {
    const modes: Array<'none' | 'all' | 'one'> = ['none', 'all', 'one'];
    const idx = modes.indexOf(repeat.value);
    repeat.value = modes[(idx + 1) % modes.length];
  }

  function addToQueue(track: MediaFile) {
    queue.value.push(track);
    enrichTrack(track);
  }
  function addToQueueMultiple(tracks: MediaFile[]) {
    queue.value.push(...tracks);
    tracks.forEach(enrichTrack);
  }
  function removeFromQueue(index: number) {
    if (index < pendingQueue.value.length) {
      pendingQueue.value.splice(index, 1);
    } else {
      queue.value.splice(index - pendingQueue.value.length, 1);
    }
  }
  function clearQueue() {
    queue.value = [];
    pendingQueue.value = [];
  }
  function flushPendingQueue() {
    if (pendingQueue.value.length) {
      pendingQueue.value.forEach(enrichTrack);
    }
  }
  function toggleQueue() {
    queueVisible.value = !queueVisible.value;
  }
  function toggleEqualizer() {
    equalizerVisible.value = !equalizerVisible.value;
  }

  function reorderQueue(from: number, to: number) {
    const items = displayQueue.value;
    if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return;
    const item = items[from];
    const pendingLen = pendingQueue.value.length;
    const fromInPending = from < pendingLen;
    const sourceArr = fromInPending ? pendingQueue.value : queue.value;
    const sourceIdx = fromInPending ? from : from - pendingLen;
    sourceArr.splice(sourceIdx, 1);
    const newPendingLen = pendingQueue.value.length;
    const adjustedTo = from < to ? to - 1 : to;
    const toInPending = adjustedTo < newPendingLen;
    const destArr = toInPending ? pendingQueue.value : queue.value;
    const destIdx = toInPending ? adjustedTo : adjustedTo - newPendingLen;
    destArr.splice(destIdx, 0, item);
  }

  function insertInQueue(index: number, track: MediaFile) {
    queue.value.splice(index, 0, track);
    enrichTrack(track);
  }

  const coverQueue: string[] = [];
  let coverFlushScheduled = false;

  let coverProcessing = false;

  async function processCoverBatch(): Promise<void> {
    coverProcessing = true;
    while (coverQueue.length > 0) {
      const batch = coverQueue.splice(0, 5);
      await Promise.all(batch.map((p) => doLoadCover(p)));
      if (coverQueue.length > 0) await new Promise<void>((r) => queueMicrotask(() => r()));
    }
    coverProcessing = false;
  }

  function scheduleCoverFlush(): void {
    if (coverProcessing || coverFlushScheduled) return;
    coverFlushScheduled = true;
    setTimeout(() => {
      coverFlushScheduled = false;
      processCoverBatch();
    }, 0);
  }

  async function doLoadCover(filePath: string): Promise<void> {
    if (filePath in coverCache.value) return;
    coverCache.value[filePath] = { type: null, data: null };
    const cover = (await window.api?.getCover(filePath)) ?? { type: null, data: null };
    if (cover.data) {
      coverCache.value[filePath] = cover;
      triggerRef(coverCache);
      return;
    }
    const frame = await captureVideoFrame(filePath);
    coverCache.value[filePath] = frame;
    triggerRef(coverCache);
  }

  async function loadCover(filePath: string): Promise<CoverResult> {
    if (filePath in coverCache.value) return coverCache.value[filePath]!;
    coverQueue.push(filePath);
    scheduleCoverFlush();
    return { type: null, data: null };
  }

  function getCover(filePath: string): CoverResult {
    return coverCache.value[filePath] ?? { type: null, data: null };
  }

  function invalidateCoverCache(filePath: string) {
    delete coverCache.value[filePath];
    triggerRef(coverCache);
    loadCover(filePath);
  }

  async function enrichTrack(track: MediaFile): Promise<void> {
    if (!track.duration) {
      let dur = 0;
      try {
        dur = (await window.api?.getDuration(track.path)) || 0;
      } catch {
        dur = 0;
      }
      if (dur > 0) {
        useLibraryStore().updateTrack(track.path, (t) => {
          t.duration = dur;
        });
      }
    }
    loadCover(track.path);
  }

  function nextTrack(): MediaFile | null {
    if (repeat.value === 'one' && currentTrack.value) {
      currentTime.value = 0;
      return { ...currentTrack.value };
    }
    if (pendingQueue.value.length > 0) {
      const idx = shuffle.value ? Math.floor(Math.random() * pendingQueue.value.length) : 0;
      const next = pendingQueue.value.splice(idx, 1)[0]!;
      setTrack(next);
      return next;
    }
    if (queue.value.length === 0) {
      if (repeat.value === 'all' && history.value.length > 0) {
        const next = history.value[history.value.length - 1];
        setTrack(next);
        history.value.pop();
        return next;
      }
      return null;
    }
    const nextIdx = shuffle.value ? Math.floor(Math.random() * queue.value.length) : 0;
    const next = queue.value[nextIdx];
    setTrack(next);
    queue.value.splice(nextIdx, 1);
    return next;
  }

  function playFromHistory(index: number) {
    const track = history.value.splice(index, 1)[0];
    if (!track) return;
    if (currentTrack.value) {
      history.value.unshift(currentTrack.value);
      if (history.value.length > 100) history.value.pop();
    }
    currentTrack.value = track;
    currentTime.value = 0;
    isPlaying.value = true;
    recordPlay(track);
  }

  function prevTrack(): MediaFile | null {
    if (history.value.length === 0) {
      return null;
    }
    if (currentTrack.value) {
      history.value.push(currentTrack.value);
      if (history.value.length > 100) history.value.shift();
    }
    const prev = history.value.shift()!;
    currentTrack.value = prev;
    currentTime.value = 0;
    isPlaying.value = true;
    recordPlay(prev);
    return prev;
  }

  async function loadSubtitles(videoPath: string): Promise<void> {
    const prevId = activeSubtitleId.value;
    const tracks: SubtitleTrack[] = [];

    const external = (await window.api?.findExternalSubtitles(videoPath)) ?? [];
    for (const sub of external) {
      const content = await window.api?.readSubtitleFile(sub.path);
      if (content) {
        tracks.push({
          id: `ext-${sub.path}`,
          label: sub.name,
          language: sub.name.includes('.') ? sub.name.split('.').slice(-2, -1)[0] || 'pl' : 'pl',
          format: sub.format as SubtitleTrack['format'],
          source: 'external',
          filePath: sub.path,
          content
        });
      }
    }

    const embedded = (await window.api?.listEmbeddedSubtitles(videoPath)) ?? [];
    for (const sub of embedded) {
      const label = sub.title || sub.language || `Track ${sub.index}`;
      tracks.push({
        id: `emb-${sub.index}`,
        label: `${label} (wbudowane)`,
        language: sub.language,
        format: 'ass',
        source: 'embedded'
      });
    }

    subtitleTracks.value = tracks;

    if (prevId && tracks.some((t) => t.id === prevId)) {
      activeSubtitleId.value = prevId;
    } else {
      const firstEmbedded = tracks.find((t) => t.source === 'embedded');
      activeSubtitleId.value = firstEmbedded ? firstEmbedded.id : null;
    }
  }

  async function loadEmbeddedSubtitle(
    trackId: string,
    videoPath: string
  ): Promise<{
    content: string;
    format: SubtitleTrack['format'];
    fonts: MkvFont[];
  } | null> {
    const embIndex = parseInt(trackId.replace('emb-', ''));
    if (isNaN(embIndex)) return null;
    const [result, fonts] = await Promise.all([
      window.api?.extractEmbeddedSubtitle(videoPath, embIndex) ?? Promise.resolve(null),
      window.api?.extractSubtitleFonts(videoPath) ?? Promise.resolve([] as MkvFont[])
    ]);
    if (!result) return null;
    logger.info(
      'Subtitles',
      `loadEmbedded: format=${result.format} fonts=${fonts.length} fontNames=[${fonts.map((f) => f.name).join(', ')}]`
    );
    return {
      content: result.content,
      format: result.format as SubtitleTrack['format'],
      fonts
    };
  }

  function setActiveSubtitle(trackId: string | null): void {
    activeSubtitleId.value = trackId;
  }

  function clearSubtitles(): void {
    subtitleTracks.value = [];
    activeSubtitleId.value = null;
  }

  function showResumePrompt(path: string, position: number): void {
    resumePrompt.value = { path, position };
  }
  function clearResumePrompt(): void {
    resumePrompt.value = null;
  }

  return {
    currentTrack,
    queue,
    history,
    isPlaying,
    isMuted,
    volume,
    currentTime,
    duration,
    playbackRate,
    shuffle,
    repeat,
    queueVisible,
    equalizerVisible,
    equalizerBands,
    equalizerPreset,
    pipActive,
    pipTime,
    pendingFullscreen,
    hasTrack,
    progress,
    queueLength,
    displayQueue,
    setTrack,
    play,
    pause,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    addToQueue,
    addToQueueMultiple,
    removeFromQueue,
    clearQueue,
    pendingQueue,
    flushPendingQueue,
    reorderQueue,
    insertInQueue,
    toggleQueue,
    toggleEqualizer,
    nextTrack,
    prevTrack,
    playFromHistory,
    loadCover,
    getCover,
    invalidateCoverCache,
    enrichTrack,
    subtitleTracks,
    activeSubtitleId,
    loadSubtitles,
    loadEmbeddedSubtitle,
    setActiveSubtitle,
    clearSubtitles,
    resumePrompt,
    showResumePrompt,
    clearResumePrompt,
    favorites,
    isFavorite,
    toggleFavorite
  };
});
