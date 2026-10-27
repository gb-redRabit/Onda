import { ref, computed, watch, effectScope } from 'vue';
import { audioEngine } from '@renderer/modules/audioEngine';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioFxStore } from '@renderer/stores/audioFx';
import { useSettingsStore } from '@renderer/stores/settings';
import { cloneEqBands, type EqBand } from '@renderer/utils/constants/audio';
import { subtitleDelayMs } from './subtitleDelay';
import { logger } from '@shared/logger';
import { wireAudioEvents } from './audioPlayerEvents';
import { isCoreShell } from '@renderer/utils/runtimeMode';
import { coreState, initCoreClient, sendCoreCommand } from '@renderer/core/coreClient';

export const currentTime = ref(0);
export const duration = ref(0);
const buffered = ref(0);
// Rzeczywisty stan elementu audio (aktualizowany dla WSZYSTKICH typów, w tym `stream`).
// Używane m.in. przez PiP audio, żeby nie pokazywać go dla wyciszonego/zakończonego strumienia,
// gdy `player.isPlaying` jest nieaktualne (dla `stream` nie jest synchronizowane).
export const isPlaying = ref(false);
const volume = ref(0.8);
const mediaEl = ref<HTMLAudioElement | null>(null);
const isReady = ref(false);
const error = ref<string | null>(null);
// Prawda między momentem zlecenia ładowania a momentem, gdy element staje się odtwarzalny
// (używane dla wskaźnika "buforowania"; strumienie również się na tym opierają).
const isLoading = ref(false);

function resumeAndPlay() {
  audioEngine.resume();
  setTimeout(() => audioEngine.play(), 50);
}

let moduleInitialized = false;
let remoteInitialized = false;

/**
 * Shell nie ma własnego AudioContext. Refy tego modułu są wspólne dla obu trybów,
 * więc wystarczy je karmić tickami z Core — reszta UI działa bez zmian.
 */
function ensureRemoteModule(): void {
  if (remoteInitialized) return;
  remoteInitialized = true;
  initCoreClient();
  console.info('[core-shell] remote audio player initialized');
  watch(
    coreState,
    (state) => {
      if (!state) return;
      currentTime.value = state.currentTime;
      duration.value = state.duration;
      buffered.value = state.buffered;
      isPlaying.value = state.enginePlaying;
      volume.value = state.volume;
      isLoading.value = state.isLoading;
      error.value = state.error;
      isReady.value = !!state.current;
    },
    { immediate: true }
  );
}

function useRemoteAudioPlayer() {
  ensureRemoteModule();
  const settings = useSettingsStore();
  const fx = useAudioFxStore();
  const send = sendCoreCommand;

  return {
    currentTime,
    duration,
    buffered,
    isPlaying,
    volume,
    progress: computed(() => (duration.value > 0 ? currentTime.value / duration.value : 0)),
    mediaEl,
    isReady,
    isLoading,
    error,
    getAnalyserNode: (): AnalyserNode | null => null,
    play: () => send({ type: 'play' }),
    pause: () => send({ type: 'pause' }),
    seek: (time: number) => {
      currentTime.value = Math.max(0, time);
      send({ type: 'seek', time });
    },
    setVolume: (v: number) => {
      const value = Math.max(0, Math.min(1, v));
      volume.value = value;
      send({ type: 'setVolume', value });
    },
    applyEqBands: (bands: EqBand[]) => {
      const copy = cloneEqBands(bands);
      fx.equalizerBands = copy;
      settings.updatePlayback({ equalizerBands: copy });
      send({ type: 'eqBands', bands: copy });
    },
    setEqEnabled: (enabled: boolean) => {
      fx.equalizerEnabled = enabled;
      settings.updatePlayback({ equalizerEnabled: enabled });
      send({ type: 'eqEnabled', enabled });
    },
    setEqPreamp: (db: number) => {
      fx.equalizerPreamp = db;
      settings.updatePlayback({ equalizerPreamp: db });
      send({ type: 'eqPreamp', db });
    },
    setEqUserPresets: (presets: Record<string, EqBand[]>) => {
      fx.equalizerUserPresets = presets;
      settings.updatePlayback({ equalizerUserPresets: presets });
    },
    setEqMulticolor: (on: boolean) => {
      fx.equalizerMulticolor = on;
      settings.updatePlayback({ equalizerMulticolor: on });
    },
    setEqSnap: (on: boolean) => {
      fx.equalizerSnap = on;
      settings.updatePlayback({ equalizerSnap: on });
    },
    applyEqGraph: (bands: EqBand[]) => send({ type: 'applyEqGraph', bands }),
    setEqMono: (on: boolean) => {
      fx.equalizerMono = on;
      send({ type: 'eqMono', on });
    },
    setNightMode: (on: boolean) => {
      fx.nightMode = on;
      settings.updatePlayback({ nightMode: on });
      send({ type: 'nightMode', on });
    },
    setAudioDelay: (ms: number) => {
      const clamped = Math.max(0, Math.min(500, Math.round(ms) || 0));
      fx.audioDelayMs = clamped;
      settings.updatePlayback({ audioDelayMs: clamped });
      send({ type: 'audioDelay', ms: clamped });
    },
    savePosition: () => {
      /* pozycję zapisuje Core */
    },
    getAudioContext: (): AudioContext | null => null
  };
}

// Debounce przebudowy łańcucha EQ (IIR ma stałe współczynniki — zmiana = rozłączenie).
let eqGraphTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleEqGraph(bands: EqBand[]): void {
  if (eqGraphTimer) clearTimeout(eqGraphTimer);
  eqGraphTimer = setTimeout(() => {
    eqGraphTimer = null;
    audioEngine.setEqBands(bands);
  }, 120);
}

function ensureModule() {
  if (moduleInitialized) return;
  moduleInitialized = true;

  wireAudioEvents({
    currentTime,
    duration,
    isPlaying,
    mediaEl,
    isReady,
    error,
    isLoading,
    buffered
  });

  const player = usePlayerStore();
  const fx = useAudioFxStore();
  const settings = useSettingsStore();

  audioEngine.setStateProvider({
    getCurrentTrackPath: () => player.currentTrack?.path ?? null,
    getCurrentTrack: () => player.currentTrack,
    isMuted: () => player.isMuted,
    getVolume: () => player.volume,
    isPlaying: () => player.isPlaying
  });
  audioEngine.setReplayGainMode(settings.playback.replayGainMode ?? 'off');
  audioEngine.setRememberPosition(settings.playback.rememberPosition);
  // Zapisany korektor parametryczny: nałóż na store + silnik (graf zastosuje przy tworzeniu kontekstu).
  const savedEq = settings.playback.equalizerBands;
  if (savedEq?.length) {
    fx.equalizerBands = cloneEqBands(savedEq);
    audioEngine.setEqBands(fx.equalizerBands);
  }
  if (settings.playback.equalizerEnabled === false) {
    fx.equalizerEnabled = false;
    audioEngine.setEqEnabled(false);
  }
  const preamp = settings.playback.equalizerPreamp ?? 0;
  fx.equalizerPreamp = preamp;
  audioEngine.setEqPreamp(preamp);
  fx.equalizerUserPresets = settings.playback.equalizerUserPresets ?? {};
  fx.equalizerMulticolor = settings.playback.equalizerMulticolor === true;
  fx.equalizerSnap = settings.playback.equalizerSnap !== false;
  fx.nightMode = settings.playback.nightMode === true;
  audioEngine.setNightMode(fx.nightMode);
  fx.audioDelayMs = settings.playback.audioDelayMs ?? 0;
  audioEngine.setAudioDelayMs(fx.audioDelayMs);
  // Opóźnienie napisów zapisujemy w tych samych ustawieniach odtwarzania co dźwięk.
  subtitleDelayMs.value = settings.playback.subtitleDelayMs ?? 0;

  const scope = effectScope(true);

  scope.run(() => {
    watch(
      () => settings.playback.replayGainMode,
      (mode) => audioEngine.setReplayGainMode(mode ?? 'off')
    );
    watch(
      () => settings.playback.rememberPosition,
      (rem) => audioEngine.setRememberPosition(rem)
    );

    // Regulacja skrótami/UI zmienia ref — tu jest jedyne miejsce zapisu do ustawień.
    watch(subtitleDelayMs, (ms) => useSettingsStore().updatePlayback({ subtitleDelayMs: ms }));

    watch(
      () => player.currentTrack?.path ?? null,
      (path, _oldPath) => {
        const track = player.currentTrack;
        logger.info(
          'audioPlayer',
          `currentTrack watch type=${track?.type ?? 'none'} path=${(path ?? '').slice(0, 60)}`
        );
        if (!track || !path) {
          audioEngine.pause();
          return;
        }
        if (track.type === 'video') {
          audioEngine.pause();
        } else if (track.type === 'stream') {
          audioEngine.loadRemote(track.path);
          resumeAndPlay();
          player.enrichPendingQueue();
        } else if (track.type === 'audio') {
          audioEngine.loadTrack(track, { resume: player.consumeResumeIntent(track.path) });
          resumeAndPlay();
          player.enrichPendingQueue();
          if (settings.playback.gaplessPlayback) {
            const next = player.pendingQueue[0] ?? player.queue[0];
            if (next && next.type === 'audio') audioEngine.preloadNext(next);
          }
        }
      }
    );

    watch(
      () => player.isPlaying,
      (playing, _wasPlaying) => {
        const trackType = player.currentTrack?.type;
        if (trackType === 'video') return;
        if (playing) {
          resumeAndPlay();
        } else {
          audioEngine.pause();
        }
      }
    );

    watch(
      () => player.isMuted,
      (muted) => {
        audioEngine.setMuted(muted);
      }
    );

    watch(
      () => player.volume,
      (v) => {
        audioEngine.setVolume(v);
      }
    );
  });

  const existingTrack = player.currentTrack;
  if (existingTrack?.type === 'audio') {
    audioEngine.loadTrack(existingTrack, {
      resume: player.consumeResumeIntent(existingTrack.path)
    });
    if (player.isPlaying) {
      resumeAndPlay();
    }
  } else if (existingTrack?.type === 'stream') {
    audioEngine.loadRemote(existingTrack.path);
    if (player.isPlaying) {
      resumeAndPlay();
    }
    player.enrichPendingQueue();
  }

  volume.value = player.volume;
}

export function useAudioPlayer() {
  if (isCoreShell()) return useRemoteAudioPlayer();
  ensureModule();

  const progress = computed(() => (duration.value > 0 ? currentTime.value / duration.value : 0));

  return {
    currentTime,
    duration,
    buffered,
    isPlaying,
    volume,
    progress,
    mediaEl,
    isReady,
    isLoading,
    error,
    // Getter, nie wartość: w chwili tworzenia komponentu kontekst audio może nie być
    // jeszcze rozgrzany, więc zamrożony `null` na zawsze psuł wizualizację.
    getAnalyserNode: () => audioEngine.getAnalyserNode(),
    play: () => resumeAndPlay(),
    pause: () => audioEngine.pause(),
    seek: (time: number) => audioEngine.seek(time),
    setVolume: (v: number) => {
      volume.value = v;
      usePlayerStore().setVolume(v);
      audioEngine.setVolume(usePlayerStore().isMuted ? 0 : v);
    },
    applyEqBands: (bands: EqBand[]) => {
      const fx = useAudioFxStore();
      fx.equalizerBands = cloneEqBands(bands);
      useSettingsStore().updatePlayback({ equalizerBands: cloneEqBands(bands) });
      // Graf przebudowujemy dopiero po chwili bez zmian — IIR ma stałe współczynniki,
      // więc każda zmiana rozłącza łańcuch (podczas kręcenia dawałoby to dropy/trzaski).
      scheduleEqGraph(fx.equalizerBands);
    },
    setEqEnabled: (enabled: boolean) => {
      useAudioFxStore().equalizerEnabled = enabled;
      audioEngine.setEqEnabled(enabled);
      useSettingsStore().updatePlayback({ equalizerEnabled: enabled });
    },
    setEqPreamp: (db: number) => {
      useAudioFxStore().equalizerPreamp = db;
      audioEngine.setEqPreamp(db);
      useSettingsStore().updatePlayback({ equalizerPreamp: db });
    },
    setEqUserPresets: (presets: Record<string, EqBand[]>) => {
      useAudioFxStore().equalizerUserPresets = presets;
      useSettingsStore().updatePlayback({ equalizerUserPresets: presets });
    },
    setEqMulticolor: (on: boolean) => {
      useAudioFxStore().equalizerMulticolor = on;
      useSettingsStore().updatePlayback({ equalizerMulticolor: on });
    },
    setEqSnap: (on: boolean) => {
      useAudioFxStore().equalizerSnap = on;
      useSettingsStore().updatePlayback({ equalizerSnap: on });
    },
    /** Nakłada pasma TYLKO na graf (bez zapisu) — np. do „solo". */
    applyEqGraph: (bands: EqBand[]) => {
      audioEngine.setEqBands(bands);
    },
    /** Odsłuch mono (kontrola fazy) — tylko na graf, bez zapisu. */
    setEqMono: (on: boolean) => {
      useAudioFxStore().equalizerMono = on;
      audioEngine.setEqMono(on);
    },
    /** Tryb nocny: kompresja dynamiki + podbicie dialogów. */
    setNightMode: (on: boolean) => {
      useAudioFxStore().nightMode = on;
      audioEngine.setNightMode(on);
      useSettingsStore().updatePlayback({ nightMode: on });
    },
    /** Kompensacja opóźnienia dźwięku (ms) względem obrazu. */
    setAudioDelay: (ms: number) => {
      const clamped = Math.max(0, Math.min(500, Math.round(ms) || 0));
      useAudioFxStore().audioDelayMs = clamped;
      audioEngine.setAudioDelayMs(clamped);
      useSettingsStore().updatePlayback({ audioDelayMs: clamped });
    },
    savePosition: () => audioEngine.savePosition(),
    getAudioContext: () => audioEngine.getAudioContext()
  };
}
