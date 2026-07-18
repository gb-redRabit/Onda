import { defineStore } from 'pinia';
import { ref, reactive, computed } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import type { SubtitleTrack, MkvFont } from '@renderer/types/subtitles';

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
  const crossfadeDuration = ref(3);
  const queueVisible = ref(false);
  const equalizerVisible = ref(false);
  const equalizerBands = ref<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const equalizerPreset = ref('flat');
  const pipActive = ref(false);
  const pipTime = ref(0);
  const coverCache = reactive(
    new Map<string, { type: 'video' | 'image' | null; data: string | null }>()
  );

  const subtitleTracks = ref<SubtitleTrack[]>([]);
  const activeSubtitleId = ref<string | null>(null);

  const hasTrack = computed(() => currentTrack.value !== null);
  const progress = computed(() => (duration.value > 0 ? currentTime.value / duration.value : 0));
  const queueLength = computed(() => queue.value.length);

  function setTrack(track: MediaFile) {
    if (currentTrack.value) {
      history.value.unshift(currentTrack.value);
      if (history.value.length > 100) history.value.pop();
    }
    currentTrack.value = track;
    currentTime.value = 0;
    if (!pipActive.value) {
      isPlaying.value = true;
    }
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
  function stop() {
    isPlaying.value = false;
    currentTime.value = 0;
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
    queue.value.splice(index, 1);
  }
  function clearQueue() {
    queue.value = [];
  }
  function toggleQueue() {
    queueVisible.value = !queueVisible.value;
  }
  function toggleEqualizer() {
    equalizerVisible.value = !equalizerVisible.value;
  }

  function reorderQueue(from: number, to: number) {
    const item = queue.value.splice(from, 1)[0];
    if (item) queue.value.splice(to, 0, item);
  }

  function insertInQueue(index: number, track: MediaFile) {
    queue.value.splice(index, 0, track);
    enrichTrack(track);
  }

  async function loadCover(
    filePath: string
  ): Promise<{ type: 'video' | 'image' | null; data: string | null }> {
    if (coverCache.has(filePath)) return coverCache.get(filePath)!;
    coverCache.set(filePath, { type: null, data: null });
    const cover = await window.api.getCover(filePath);
    coverCache.set(filePath, cover);
    return cover;
  }

  function getCover(filePath: string): { type: 'video' | 'image' | null; data: string | null } {
    return coverCache.get(filePath) ?? { type: null, data: null };
  }

  async function enrichTrack(track: MediaFile): Promise<void> {
    if (!track.duration) {
      const dur = await window.api.getDuration(track.path);
      if (dur > 0) {
        track.duration = dur;
        queue.value = [...queue.value];
      }
    }
    loadCover(track.path);
  }

  function nextTrack(): MediaFile | null {
    if (repeat.value === 'one' && currentTrack.value) {
      setTrack(currentTrack.value);
      return currentTrack.value;
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
    const nextIdx = shuffle.value
      ? Math.floor(Math.random() * queue.value.length)
      : 0;
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
  }

  function prevTrack(): MediaFile | null {
    if (history.value.length === 0) return null;
    const prev = history.value.shift()!;
    currentTrack.value = prev;
    currentTime.value = 0;
    isPlaying.value = true;
    return prev;
  }

  async function loadSubtitles(videoPath: string): Promise<void> {
    const prevId = activeSubtitleId.value;
    const tracks: SubtitleTrack[] = [];

    const external = await window.api.findExternalSubtitles(videoPath);
    for (const sub of external) {
      const content = await window.api.readSubtitleFile(sub.path);
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

    const embedded = await window.api.listEmbeddedSubtitles(videoPath);
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
      window.api.extractEmbeddedSubtitle(videoPath, embIndex),
      window.api.extractSubtitleFonts(videoPath)
    ]);
    if (!result) return null;
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
    crossfadeDuration,
    queueVisible,
    equalizerVisible,
    equalizerBands,
    equalizerPreset,
    pipActive,
    pipTime,
    hasTrack,
    progress,
    queueLength,
    setTrack,
    play,
    pause,
    togglePlay,
    stop,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    addToQueue,
    addToQueueMultiple,
    removeFromQueue,
    clearQueue,
    reorderQueue,
    insertInQueue,
    toggleQueue,
    toggleEqualizer,
    nextTrack,
    prevTrack,
    playFromHistory,
    loadCover,
    getCover,
    enrichTrack,
    subtitleTracks,
    activeSubtitleId,
    loadSubtitles,
    loadEmbeddedSubtitle,
    setActiveSubtitle,
    clearSubtitles
  };
});
