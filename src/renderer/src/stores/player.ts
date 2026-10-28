import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { usePlayerFavorites } from './player-favorites';
import { usePlayerStats } from './player-stats';
import { usePlayerSubtitles } from './player-subtitles';
import { usePlayerCover } from './player-cover';
import { usePlayerQueue } from './player-queue';
import { usePlayerNavigation } from './player-navigation';
import { usePlayerAb } from './player-ab';
import { isCoreShell } from '@renderer/utils/runtimeMode';
import { sendCoreCommand } from '@renderer/core/coreClient';
import { toPlainTrack } from '@shared/core-state';
import { logger } from '@shared/logger';

export type { CoverResult } from './player-cover';

export const usePlayerStore = defineStore('player', () => {
  const isMuted = ref(false);
  const volume = ref(0.8);
  const duration = ref(0);
  const subtitlePanelVisible = ref(false);
  const pendingFullscreen = ref(false);
  const resumePrompt = ref<{ path: string; position: number } | null>(null);
  // Utwór tylko do wyświetlania pokazywany, gdy URL strumienia YouTube jest rozwiązywany, więc
  // pasek odtwarzacza pojawia się w momencie kliknięcia przez użytkownika. Zastępowany przez currentTrack
  // gdy URL będzie gotowy; nigdy nie podawany silnikowi audio.
  const streamPending = ref<MediaFile | null>(null);

  const { loadCover, getCover, invalidateCoverCache, enrichTrack } = usePlayerCover();
  const {
    queue,
    pendingQueue,
    queueVisible,
    queueLength,
    displayQueue,
    addToQueue: addToQueueBase,
    addToQueueMultiple: addToQueueMultipleBase,
    removeFromQueue: removeFromQueueBase,
    clearQueue: clearQueueBase,
    enrichPendingQueue,
    reorderQueue: reorderQueueBase,
    insertInQueue: insertInQueueBase,
    toggleQueue
  } = usePlayerQueue(enrichTrack);
  const { favorites, isFavorite, toggleFavorite, ensureFavorites } = usePlayerFavorites();
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
    setTrack: setTrackBase,
    clearTrack: clearTrackBase,
    play: playBase,
    pause: pauseBase,
    togglePlay: togglePlayBase,
    seek: seekBase,
    toggleShuffle: toggleShuffleBase,
    cycleRepeat: cycleRepeatBase,
    nextTrack: nextTrackBase,
    prevTrack: prevTrackBase,
    playFromHistory: playFromHistoryBase,
    consumeResumeIntent,
    enterPiP: enterPiPBase,
    exitPiP: exitPiPBase
  } = usePlayerNavigation(queue, pendingQueue, recordPlay);
  const {
    abA,
    abB,
    abActive,
    setA: setAbA,
    setB: setAbB,
    toggle: toggleAb,
    clear: clearAb,
    moveA: moveAbA,
    moveB: moveAbB,
    loopTarget: abLoopTarget
  } = usePlayerAb();

  const hasTrack = computed(() => currentTrack.value !== null);
  const progress = computed(() => (duration.value > 0 ? currentTime.value / duration.value : 0));

  // --- Most do Core (tylko tryb shellu) -------------------------------------
  // Store pozostaje lokalnym odbiciem: UI czyta te same refy, a każda mutacja
  // jest wysyłana do Core, który jest właścicielem dźwięku i kolejki.
  function plainTracks(tracks: readonly MediaFile[]): MediaFile[] {
    return tracks
      .map((track) => toPlainTrack(track))
      .filter((track): track is MediaFile => !!track);
  }

  function sendQueue(): void {
    if (!isCoreShell()) return;
    sendCoreCommand({
      type: 'setQueue',
      queue: plainTracks(queue.value),
      pendingQueue: plainTracks(pendingQueue.value)
    });
  }

  function addToQueue(track: MediaFile): void {
    addToQueueBase(track);
    sendQueue();
  }
  function addToQueueMultiple(tracks: MediaFile[]): void {
    addToQueueMultipleBase(tracks);
    sendQueue();
  }
  function removeFromQueue(index: number): void {
    removeFromQueueBase(index);
    sendQueue();
  }
  function clearQueue(): void {
    clearQueueBase();
    sendQueue();
  }
  function reorderQueue(from: number, to: number): void {
    reorderQueueBase(from, to);
    sendQueue();
  }
  function insertInQueue(index: number, track: MediaFile): void {
    insertInQueueBase(index, track);
    sendQueue();
  }

  function setTrack(track: MediaFile, options?: { resume?: boolean }): void {
    if (isCoreShell()) {
      if (track.type === 'image') {
        logger.warn('core-shell', 'image playback is not supported');
        return;
      }
      const plain = toPlainTrack(track);
      if (!plain) return;
      sendCoreCommand({
        type: 'load',
        track: plain,
        resume: options?.resume === true,
        queue: plainTracks(queue.value),
        pendingQueue: plainTracks(pendingQueue.value)
      });
      // Stan (łącznie z currentTrack) przyjdzie z Core; nie duplikujemy go lokalnie,
      // żeby nie policzyć odtworzenia dwa razy.
      return;
    }
    setTrackBase(track, options);
  }

  /** Odtworzenie wykryte po stronie Core (auto-advance) — aktualizuje statystyki shellu. */
  function recordExternalPlay(track: MediaFile): void {
    recordPlay(track);
  }
  function clearTrack(): void {
    if (isCoreShell()) sendCoreCommand({ type: 'clear' });
    clearTrackBase();
  }
  function play(): void {
    if (isCoreShell()) sendCoreCommand({ type: 'play' });
    playBase();
  }
  function pause(): void {
    if (isCoreShell()) sendCoreCommand({ type: 'pause' });
    pauseBase();
  }
  function togglePlay(): void {
    if (isCoreShell()) sendCoreCommand({ type: 'toggle' });
    togglePlayBase();
  }
  function seek(time: number): void {
    if (isCoreShell()) {
      // Wideo nie ma elementu w Core — przewijamy lokalny <video> w main shellu.
      if (currentTrack.value?.type === 'video') {
        const video = document.querySelector('video');
        if (video) video.currentTime = time;
      }
      sendCoreCommand({ type: 'seek', time });
    }
    seekBase(time);
  }
  function toggleShuffle(): void {
    if (isCoreShell()) sendCoreCommand({ type: 'toggleShuffle' });
    toggleShuffleBase();
  }
  function cycleRepeat(): void {
    if (isCoreShell()) sendCoreCommand({ type: 'cycleRepeat' });
    cycleRepeatBase();
  }
  function nextTrack(): MediaFile | null {
    if (isCoreShell()) {
      sendCoreCommand({ type: 'next' });
      return null;
    }
    return nextTrackBase();
  }
  function prevTrack(): MediaFile | null {
    if (isCoreShell()) {
      sendCoreCommand({ type: 'prev' });
      return null;
    }
    return prevTrackBase();
  }
  function playFromHistory(index: number): void {
    if (isCoreShell()) {
      sendCoreCommand({ type: 'playFromHistory', index });
      return;
    }
    playFromHistoryBase(index);
  }
  function enterPiP(time = currentTime.value): void {
    if (isCoreShell()) sendCoreCommand({ type: 'setPip', active: true, time });
    enterPiPBase(time);
  }
  function exitPiP(time = pipTime.value): void {
    if (isCoreShell()) sendCoreCommand({ type: 'setPip', active: false, time });
    exitPiPBase(time);
  }

  function setVolume(v: number) {
    const value = Math.max(0, Math.min(1, v));
    volume.value = value;
    if (isCoreShell()) sendCoreCommand({ type: 'setVolume', value });
  }
  function toggleMute() {
    isMuted.value = !isMuted.value;
    if (isCoreShell()) sendCoreCommand({ type: 'toggleMute' });
  }
  function toggleSubtitlePanel() {
    subtitlePanelVisible.value = !subtitlePanelVisible.value;
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
    shuffle,
    repeat,
    queueVisible,
    subtitlePanelVisible,
    pipActive,
    pipTime,
    pendingFullscreen,
    hasTrack,
    progress,
    abA,
    abB,
    abActive,
    setAbA,
    setAbB,
    toggleAb,
    clearAb,
    moveAbA,
    moveAbB,
    abLoopTarget,
    queueLength,
    displayQueue,
    setTrack,
    clearTrack,
    recordExternalPlay,
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
    enrichPendingQueue,
    reorderQueue,
    insertInQueue,
    toggleQueue,
    toggleSubtitlePanel,
    nextTrack,
    prevTrack,
    playFromHistory,
    consumeResumeIntent,
    enterPiP,
    exitPiP,
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
    toggleFavorite,
    ensureFavorites
  };
});
