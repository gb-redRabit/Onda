import type { Ref } from 'vue';
import { audioEngine } from '@renderer/modules/audioEngine';
import { audioEvents } from '@renderer/utils/audioEvents';
import { usePlayerStore } from '@renderer/stores/player';

export interface AudioEventRefs {
  currentTime: Ref<number>;
  duration: Ref<number>;
  isPlaying: Ref<boolean>;
  mediaEl: Ref<HTMLAudioElement | null>;
  isReady: Ref<boolean>;
  error: Ref<string | null>;
  isLoading: Ref<boolean>;
  buffered: Ref<number>;
}

// okablowanie zdarzeń audioEngine wyodrębnione z `composables/useAudioPlayer.ts`
// (plan 2.8). Rejestrowane raz na czas życia renderera.
export function wireAudioEvents(r: AudioEventRefs): void {
  audioEvents.on('timeUpdate', (time: number) => {
    r.currentTime.value = time;
  });

  audioEvents.on('durationChange', (dur: number) => {
    // Strumienie radia na żywo zwracają Infinity — traktujemy to jako "brak czasu trwania"
    // zamiast psuć renderowanie postępu/czasu.
    r.duration.value = Number.isFinite(dur) && dur > 0 ? dur : 0;
  });

  audioEvents.on('playStateChange', (playing: boolean) => {
    r.isPlaying.value = playing;
    if (usePlayerStore().currentTrack?.type === 'audio') {
      usePlayerStore().isPlaying = playing;
    }
  });

  audioEvents.on('trackLoaded', () => {
    r.mediaEl.value = audioEngine.getMediaElement();
    r.isReady.value = true;
    r.error.value = null;
    r.buffered.value = 0;
    r.isLoading.value = true;
  });

  audioEvents.on('playable', () => {
    r.isLoading.value = false;
  });

  audioEvents.on('streamError', () => {
    r.isLoading.value = false;
    r.error.value = 'stream-failed';
  });

  // Ładowanie lokalnego pliku nie powiodło się (brakujący/nieczytelny plik, błąd serwera mediów).
  // Auto-pomijanie podczas odtwarzania; 2-sekundowy throttle ogranicza lawinę pominięć (np. folder
  // nieaktualnych wpisów lub repeat-one na uszkodzonym pliku) — potem pauza.
  let lastTrackErrorAt = 0;
  audioEvents.on('trackError', () => {
    r.isLoading.value = false;
    r.error.value = 'track-failed';
    const p = usePlayerStore();
    if (!p.isPlaying) return;
    const now = performance.now();
    if (now - lastTrackErrorAt < 2000) {
      p.pause();
      return;
    }
    lastTrackErrorAt = now;
    const next = p.nextTrack();
    if (!next || next.path === p.currentTrack?.path) {
      p.pause();
    }
  });

  audioEvents.on('bufferChange', (frac) => {
    r.buffered.value = frac;
  });

  audioEvents.on('trackEnd', () => {
    const p = usePlayerStore();
    if (p.repeat === 'one' && p.currentTrack?.type === 'audio') {
      audioEngine.seek(0);
      audioEngine.play();
    } else {
      p.nextTrack();
    }
  });
}
