import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { usePlayerFavorites } from './player-favorites';
import { usePlayerStats } from './player-stats';
import { usePlayerSubtitles } from './player-subtitles';
import { usePlayerCover } from './player-cover';
import { usePlayerQueue } from './player-queue';
import { usePlayerNavigation } from './player-navigation';

export type { CoverResult } from './player-cover';

export const usePlayerStore = defineStore('player', () => {
  const isMuted = ref(false);
  const volume = ref(0.8);
  const duration = ref(0);
  const playbackRate = ref(1);
  const equalizerVisible = ref(false);
  const equalizerBands = ref<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const equalizerPreset = ref('flat');
  const pendingFullscreen = ref(false);
  const resumePrompt = ref<{ path: string; position: number } | null>(null);
  // Display-only track shown while a YouTube stream URL is being resolved, so
  // the player bar appears the moment the user clicks. Replaced by currentTrack
  // once the URL is ready; never fed to the audio engine.
  const streamPending = ref<MediaFile | null>(null);

  const { loadCover, getCover, invalidateCoverCache, enrichTrack } = usePlayerCover();
  const {
    queue,
    pendingQueue,
    queueVisible,
    queueLength,
    displayQueue,
    addToQueue,
    addToQueueMultiple,
    removeFromQueue,
    clearQueue,
    flushPendingQueue,
    reorderQueue,
    insertInQueue,
    toggleQueue
  } = usePlayerQueue(enrichTrack);
  const { favorites, isFavorite, toggleFavorite } = usePlayerFavorites();
  const { recordPlay } = usePlayerStats();
  const {
    subtitleTracks,
    activeSubtitleId,
    loadSubtitles,
    loadEmbeddedSubtitle,
    setActiveSubtitle,
    loadCustomSubtitles,
    clearSubtitles
  } = usePlayerSubtitles();
  const {
    currentTrack,
    history,
    isPlaying,
    currentTime,
    pipActive,
    pipTime,
    shuffle,
    repeat,
    setTrack,
    play,
    pause,
    togglePlay,
    seek,
    toggleShuffle,
    cycleRepeat,
    nextTrack,
    prevTrack,
    playFromHistory
  } = usePlayerNavigation(queue, pendingQueue, recordPlay);

  const hasTrack = computed(() => currentTrack.value !== null);
  const progress = computed(() => (duration.value > 0 ? currentTime.value / duration.value : 0));

  function setVolume(v: number) {
    volume.value = Math.max(0, Math.min(1, v));
  }
  function toggleMute() {
    isMuted.value = !isMuted.value;
  }
  function toggleEqualizer() {
    equalizerVisible.value = !equalizerVisible.value;
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
    loadCustomSubtitles,
    clearSubtitles,
    resumePrompt,
    showResumePrompt,
    clearResumePrompt,
    streamPending,
    favorites,
    isFavorite,
    toggleFavorite
  };
});
