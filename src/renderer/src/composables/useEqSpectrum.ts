import { computed, onMounted, onUnmounted, ref } from 'vue';
import { EQ_CURVE, SPECTRUM_BARS } from '@renderer/utils/eqGeometry';

// Pętla spektrum na żywo dla korektora: czyta AnalyserNode i buduje ścieżkę SVG
// widma. Wydzielone z `Equalizer.vue` (plan 2.8), żeby SFC trzymał tylko UI.

export interface EqSpectrumDeps {
  isPlaying: () => boolean;
  getAnalyser: () => AnalyserNode | null;
  getSampleRate: () => number;
}

export function useEqSpectrum(deps: EqSpectrumDeps) {
  const spectrum = ref<number[]>([]);
  let raf = 0;
  // Bufor alokujemy raz (rozmiar zależy od fftSize, nie od klatki) — wcześniej `new Uint8Array`
  // powstawał 60×/s, co generowało stałą presję na GC.
  let spectrumBuf: Uint8Array<ArrayBuffer> | null = null;

  function tick(): void {
    raf = requestAnimationFrame(tick);
    // Na pauzie nic nie rysujemy — animowanie wykresu dla zatrzymanego dźwięku to zgadywanie.
    if (!deps.isPlaying()) return;
    const analyser = deps.getAnalyser();
    if (!analyser) return;
    spectrumBuf ??= new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(spectrumBuf);
    // Nyquist z realnego próbkowania kontekstu (44.1/48/96 kHz), nie zaszyte 24 kHz.
    const nyquist = (deps.getSampleRate() || 48000) / 2;
    const bars: number[] = [];
    for (let i = 0; i < SPECTRUM_BARS; i++) {
      const f = Math.pow(
        10,
        Math.log10(20) + (i / SPECTRUM_BARS) * (Math.log10(20000) - Math.log10(20))
      );
      const bin = Math.round((f / nyquist) * spectrumBuf.length);
      bars.push((spectrumBuf[Math.min(spectrumBuf.length - 1, bin)] ?? 0) / 255);
    }
    spectrum.value = bars;
  }

  const spectrumPath = computed(() => {
    if (!spectrum.value.length) return '';
    const pts = spectrum.value.map((v, i) => {
      const x = (i / (SPECTRUM_BARS - 1)) * EQ_CURVE.width;
      const y = EQ_CURVE.height - v * EQ_CURVE.height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M 0,${EQ_CURVE.height} L ${pts.join(' L ')} L ${EQ_CURVE.width},${EQ_CURVE.height} Z`;
  });

  onMounted(() => {
    raf = requestAnimationFrame(tick);
  });
  onUnmounted(() => cancelAnimationFrame(raf));

  return { spectrumPath };
}
