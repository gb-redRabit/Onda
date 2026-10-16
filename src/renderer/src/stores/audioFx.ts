import { defineStore } from 'pinia';
import { ref } from 'vue';
import { DEFAULT_EQ_BANDS, cloneEqBands, type EqBand } from '@renderer/utils/constants/audio';

// Stan EFEKTÓW audio (korektor parametryczny, tryb nocny, opóźnienie dźwięku) —
// wydzielony ze store `player`, który ma trzymać wyłącznie stan odtwarzania. Tutaj
// jest JEDNO źródło prawdy dla tych wartości; `useAudioPlayer` jest mostem, który
// zapisuje je do ustawień i stosuje na silniku audio (`audioEngine`).
export const useAudioFxStore = defineStore('audioFx', () => {
  const equalizerVisible = ref(false);
  const equalizerBands = ref<EqBand[]>(cloneEqBands(DEFAULT_EQ_BANDS));
  const equalizerEnabled = ref(true);
  const equalizerPreamp = ref(0);
  const equalizerUserPresets = ref<Record<string, EqBand[]>>({});
  const equalizerMulticolor = ref(false);
  const equalizerSnap = ref(true);
  const equalizerSolo = ref<number | null>(null);
  const equalizerMono = ref(false);
  const nightMode = ref(false);
  const audioDelayMs = ref(0);
  const equalizerPreset = ref('flat');

  function toggleEqualizer(): void {
    equalizerVisible.value = !equalizerVisible.value;
  }

  return {
    equalizerVisible,
    equalizerBands,
    equalizerEnabled,
    equalizerPreamp,
    equalizerUserPresets,
    equalizerMulticolor,
    equalizerSnap,
    equalizerSolo,
    equalizerMono,
    nightMode,
    audioDelayMs,
    equalizerPreset,
    toggleEqualizer
  };
});
