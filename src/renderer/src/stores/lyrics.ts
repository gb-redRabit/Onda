import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type { LyricsLine, LyricsResult } from '@shared/types/lyrics';
import { usePlayerStore } from './player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import {
  clampLyricsDelay,
  clampLyricsFontScale,
  findActiveLyricsLine,
  LYRICS_DELAY_COARSE_MS,
  LYRICS_DELAY_STEP_MS,
  LYRICS_FONT_STEP
} from '@renderer/utils/lyrics';

const EMPTY: LyricsResult = { kind: 'none', lines: [] };

export const useLyricsStore = defineStore('lyrics', () => {
  const player = usePlayerStore();
  const audio = useAudioPlayer();

  const loading = ref(false);
  const error = ref('');
  const result = ref<LyricsResult>(EMPTY);
  const delayMs = ref(0);
  const fontScale = ref(1);
  let loadSeq = 0;
  let lastPath = '';

  const lines = computed<LyricsLine[]>(() => {
    const offset = result.value.offsetMs ?? 0;
    if (!offset) return result.value.lines;
    return result.value.lines.map((line) => ({
      ...line,
      timeMs: Math.max(0, line.timeMs + offset)
    }));
  });

  // `player.currentTime` jest czasem nawigacji (seek), a nie zegarem odtwarzania.
  // Rzeczywisty czas audio aktualizuje `audioEvents` w `useAudioPlayer`.
  const currentTime = computed(() => audio.currentTime.value);

  const activeIndex = computed(() => {
    if (result.value.kind !== 'synced') return -1;
    return findActiveLyricsLine(lines.value, currentTime.value * 1000 - delayMs.value);
  });

  async function load(filePath: string): Promise<void> {
    const seq = ++loadSeq;
    lastPath = filePath;
    loading.value = true;
    error.value = '';
    try {
      const next = await window.api?.getLyrics(filePath);
      if (seq !== loadSeq) return;
      result.value = next ?? EMPTY;
    } catch {
      if (seq !== loadSeq) return;
      result.value = EMPTY;
      error.value = 'lyrics.loadError';
    } finally {
      if (seq === loadSeq) loading.value = false;
    }
  }

  function reset(): void {
    loadSeq++;
    loading.value = false;
    error.value = '';
    result.value = EMPTY;
    lastPath = '';
  }

  function setDelay(ms: number): number {
    delayMs.value = clampLyricsDelay(ms);
    return delayMs.value;
  }

  function adjustDelay(deltaMs: number): number {
    return setDelay(delayMs.value + deltaMs);
  }

  function resetDelay(): number {
    return setDelay(0);
  }

  function setFontScale(scale: number): number {
    fontScale.value = clampLyricsFontScale(scale);
    return fontScale.value;
  }

  function adjustFontScale(delta: number): number {
    return setFontScale(fontScale.value + delta);
  }

  function seekToLine(index: number): void {
    const line = lines.value[index];
    if (!line) return;
    audio.seek(Math.max(0, (line.timeMs + delayMs.value) / 1000));
  }

  watch(
    () => [player.currentTrack?.path, player.currentTrack?.type] as const,
    () => {
      const track = player.currentTrack;
      if (!track || track.type !== 'audio') {
        reset();
        return;
      }
      if (track.path === lastPath && result.value.kind !== 'none') return;
      void load(track.path);
    },
    { immediate: true }
  );

  return {
    loading,
    error,
    result,
    delayMs,
    fontScale,
    lines,
    activeIndex,
    load,
    reset,
    setDelay,
    adjustDelay,
    resetDelay,
    setFontScale,
    adjustFontScale,
    seekToLine,
    stepMs: LYRICS_DELAY_STEP_MS,
    coarseMs: LYRICS_DELAY_COARSE_MS,
    fontStep: LYRICS_FONT_STEP
  };
});
