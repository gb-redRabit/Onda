<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  RotateCcw,
  Plus,
  Trash2,
  SlidersHorizontal,
  Power,
  Download,
  Upload,
  Save,
  Palette,
  Magnet,
  Combine,
  Moon
} from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioFxStore } from '@renderer/stores/audioFx';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { useUIStore } from '@renderer/stores/ui';
import {
  EQUALIZER_PRESETS,
  EQUALIZER_PRESET_LABELS,
  EQ_LIMITS,
  cloneEqBands,
  eqBandColor,
  matchesEqPreset,
  snapFrequency,
  type EqBand,
  type EqBandType
} from '@renderer/utils/constants/audio';
import { sanitizeEqBands, sanitizeEqPreamp } from '@shared/eqSanitize';
import { eqCurvePath, freqToRatio, ratioToFreq } from '@renderer/utils/eqCurve';
import { usePromptDialog } from '@renderer/composables/usePromptDialog';
import ExplorerPromptDialog from '@renderer/components/explorer/ExplorerPromptDialog.vue';

const player = usePlayerStore();
const fx = useAudioFxStore();
const audio = useAudioPlayer();
const ui = useUIStore();
const prompt = usePromptDialog();
const { applyEqBands } = audio;
const { t } = useI18n();

const panel = ref<HTMLElement | null>(null);
const showControls = ref(true);
const menuBand = ref<number | null>(null);

function onClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  if (menuBand.value !== null) menuBand.value = null;
  if (
    panel.value &&
    !panel.value.contains(target) &&
    !(target as HTMLElement).closest('[data-eq-toggle]')
  ) {
    fx.equalizerVisible = false;
  }
}
onMounted(() => document.addEventListener('click', onClickOutside));
onUnmounted(() => document.removeEventListener('click', onClickOutside));

const bandTypes: EqBandType[] = ['lowshelf', 'peaking', 'highshelf'];
const limits = EQ_LIMITS;
const presetLabels: Record<string, string> = {
  ...EQUALIZER_PRESET_LABELS,
  classical: t('equalizer.classical'),
  bassBoost: t('equalizer.bass'),
  trebleBoost: t('equalizer.treble'),
  vocal: t('equalizer.vocal')
};

const bands = computed(() => fx.equalizerBands);
const color = (i: number) => (fx.equalizerMulticolor ? eqBandColor(i) : 'var(--color-primary)');
const snap = (freq: number) => (fx.equalizerSnap ? snapFrequency(freq) : freq);

// „Solo": odsłuchaj tylko jedno pasmo (reszta neutralna) — zmiana tylko na grafie, bez zapisu.
const solo = ref<number | null>(null);
function applySoloGraph() {
  const list =
    solo.value !== null && bands.value[solo.value] ? [bands.value[solo.value]] : bands.value;
  audio.applyEqGraph(list);
}
function toggleSolo(i: number) {
  solo.value = solo.value === i ? null : i;
  applySoloGraph();
}
watch(bands, () => {
  if (solo.value !== null) applySoloGraph();
});
const markerRadius = (type: EqBandType): string =>
  type === 'lowshelf' ? '50% 50% 18% 18%' : type === 'highshelf' ? '18% 18% 50% 50%' : '50%';

const userPresets = computed(() => fx.equalizerUserPresets ?? {});
const activePreset = computed(() => {
  for (const name of Object.keys(userPresets.value)) {
    if (matchesEqPreset(bands.value, userPresets.value[name])) return name;
  }
  for (const name of Object.keys(EQUALIZER_PRESETS)) {
    if (matchesEqPreset(bands.value, EQUALIZER_PRESETS[name])) return name;
  }
  return 'custom';
});

// --- krzywa ---
const CURVE = { width: 480, height: 110, minFreq: 20, maxFreq: 20000, minDb: -18, maxDb: 18 };
const curvePath = computed(() => eqCurvePath(bands.value, CURVE, fx.equalizerPreamp));
const dbToY = (db: number) =>
  CURVE.height -
  ((Math.max(CURVE.minDb, Math.min(CURVE.maxDb, db)) - CURVE.minDb) / (CURVE.maxDb - CURVE.minDb)) *
    CURVE.height;
const zeroLineY = dbToY(0);
const GRID_FREQS = [100, 1000, 10000];
const GRID_DBS = [-12, -6, 6, 12];
const bandX = (freq: number) => freqToRatio(freq, CURVE.minFreq, CURVE.maxFreq) * 100;
const bandY = (gain: number) =>
  ((CURVE.maxDb - Math.max(CURVE.minDb, Math.min(CURVE.maxDb, gain))) /
    (CURVE.maxDb - CURVE.minDb)) *
  100;

// spektrum na żywo
const spectrum = ref<number[]>([]);
const SPECTRUM_BARS = 48;
let raf = 0;
// Bufor alokujemy raz (rozmiar zależy od fftSize, nie od klatki) — wcześniej `new Uint8Array`
// powstawał 60×/s, co generowało stałą presję na GC.
let spectrumBuf: Uint8Array<ArrayBuffer> | null = null;
function tick() {
  raf = requestAnimationFrame(tick);
  // Na pauzie nic nie rysujemy — animowanie wykresu dla zatrzymanego dźwięku to zgadywanie.
  if (!player.isPlaying) return;
  const analyser = audio.getAnalyserNode();
  if (!analyser) return;
  spectrumBuf ??= new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(spectrumBuf);
  // Nyquist z realnego próbkowania kontekstu (44.1/48/96 kHz), nie zaszyte 24 kHz.
  const nyquist = (audio.getAudioContext()?.sampleRate ?? 48000) / 2;
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
    const x = (i / (SPECTRUM_BARS - 1)) * CURVE.width;
    const y = CURVE.height - v * CURVE.height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M 0,${CURVE.height} L ${pts.join(' L ')} L ${CURVE.width},${CURVE.height} Z`;
});

const curveEl = ref<HTMLElement | null>(null);
const draggingBand = ref<number | null>(null);
const hoverBand = ref<number | null>(null);
// Menu kontekstowe otwiera się w dół, gdy kropka jest w górnej połowie, i w górę w dolnej —
// dzięki temu nigdy nie wychodzi poza wykres.
const menuBelow = computed(() =>
  menuBand.value === null
    ? true
    : bandY((bands.value[menuBand.value]?.gain ?? 0) + fx.equalizerPreamp) < 55
);

function timeFromEvent(e: PointerEvent | MouseEvent): { frequency: number; gain: number } | null {
  const el = curveEl.value;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const rx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const ry = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  return {
    frequency: Math.round(snap(ratioToFreq(rx, CURVE.minFreq, CURVE.maxFreq))),
    gain: Math.round(CURVE.maxDb - ry * (CURVE.maxDb - CURVE.minDb) - fx.equalizerPreamp)
  };
}
function onCurveDown(i: number, e: PointerEvent) {
  e.preventDefault();
  e.stopPropagation();
  draggingBand.value = i;
  (e.currentTarget as Element).setPointerCapture(e.pointerId);
}
function onCurveMove(e: PointerEvent) {
  if (draggingBand.value === null) return;
  const pt = timeFromEvent(e);
  if (pt) patchBand(draggingBand.value, pt);
}
function onCurveUp() {
  draggingBand.value = null;
}
// dwuklik w puste miejsce = dodaj pasmo w tym punkcie
function onCurveDblClick(e: MouseEvent) {
  if (bands.value.length >= limits.maxBands) return;
  const pt = timeFromEvent(e);
  if (!pt) return;
  const next = cloneEqBands(bands.value);
  next.push({ type: 'peaking', frequency: pt.frequency, q: 1, gain: pt.gain });
  commit(next);
}
function onMarkerDblClick(i: number) {
  patchBand(i, { gain: 0 });
}
function onMarkerContext(e: MouseEvent, i: number) {
  e.preventDefault();
  menuBand.value = menuBand.value === i ? null : i;
}

function commit(next: EqBand[], preset = 'custom') {
  fx.equalizerPreset = preset;
  applyEqBands(next);
}
function selectPreset(name: string) {
  const src = userPresets.value[name] ?? EQUALIZER_PRESETS[name];
  if (src) commit(cloneEqBands(src), name);
}
function patchBand(i: number, patch: Partial<EqBand>) {
  const next = cloneEqBands(bands.value);
  if (!next[i]) return;
  next[i] = { ...next[i], ...patch };
  commit(next);
}
function setType(i: number, type: EqBandType) {
  patchBand(i, { type });
  menuBand.value = null;
}
function addBand() {
  if (bands.value.length >= limits.maxBands) return;
  const next = cloneEqBands(bands.value);
  next.push({ type: 'peaking', frequency: 1000, q: 1, gain: 0 });
  commit(next);
}
function removeBand(i: number) {
  if (bands.value.length <= 1) return;
  const next = cloneEqBands(bands.value);
  next.splice(i, 1);
  commit(next);
  menuBand.value = null;
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
function onGainKey(e: KeyboardEvent, index: number) {
  const current = bands.value[index]?.gain ?? 0;
  let next: number | null = null;
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = current + 1;
  else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = current - 1;
  else if (e.key === 'PageUp') next = current + 6;
  else if (e.key === 'PageDown') next = current - 6;
  else if (e.key === 'Home') next = limits.minGain;
  else if (e.key === 'End') next = limits.maxGain;
  else if (e.key === '0') next = 0;
  if (next === null) return;
  e.preventDefault();
  patchBand(index, { gain: clamp(next, limits.minGain, limits.maxGain) });
}
function onFreqKey(e: KeyboardEvent, index: number) {
  const b = bands.value[index];
  if (!b) return;
  const step = e.shiftKey ? 1.05 : 1.01;
  let next: number | null = null;
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = b.frequency * step;
  else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = b.frequency / step;
  else if (e.key === 'Home') next = limits.minFrequency;
  else if (e.key === 'End') next = limits.maxFrequency;
  if (next === null) return;
  e.preventDefault();
  patchBand(index, {
    frequency: Math.round(snap(clamp(next, limits.minFrequency, limits.maxFrequency)))
  });
}
function onQKey(e: KeyboardEvent, index: number) {
  const b = bands.value[index];
  if (!b) return;
  const step = e.shiftKey ? 1 : 0.1;
  let next: number | null = null;
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = b.q + step;
  else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = b.q - step;
  else if (e.key === 'Home') next = limits.minQ;
  else if (e.key === 'End') next = limits.maxQ;
  if (next === null) return;
  e.preventDefault();
  patchBand(index, { q: Math.round(clamp(next, limits.minQ, limits.maxQ) * 10) / 10 });
}
function onGainDrag(e: MouseEvent, index: number) {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  function update(ev: MouseEvent) {
    const pct = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
    patchBand(index, {
      gain: Math.round(pct * (limits.maxGain - limits.minGain) + limits.minGain)
    });
  }
  update(e);
  function onMove(ev: MouseEvent) {
    update(ev);
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
function typeLabel(type: EqBandType): string {
  return t(`equalizer.type_${type}`);
}
const gainPct = (gain: number) =>
  ((gain - limits.minGain) / (limits.maxGain - limits.minGain)) * 100;

// --- własne presety + eksport/import ---
// Nazwę zbieramy we własnym polu w panelu, bo `window.prompt()` nie jest obsługiwane
// w Electronie (rzuca „prompt() is and will not be supported") — wcześniej zapis presetu
// był martwą funkcją, a domyślna nazwa mogła nadpisać istniejący preset bez ostrzeżenia.
const naming = ref(false);
const presetName = ref('');
const canSavePreset = computed(() => {
  const name = presetName.value.trim();
  if (!name) return false;
  return !(name in userPresets.value) && !(name in EQUALIZER_PRESETS);
});
function savePreset() {
  presetName.value = `${t('equalizer.custom')} ${Object.keys(userPresets.value).length + 1}`;
  naming.value = true;
}
function confirmSavePreset() {
  const name = presetName.value.trim();
  if (!name) return;
  if (name in userPresets.value || name in EQUALIZER_PRESETS) {
    ui.notify('error', t('equalizer.savePreset'), t('equalizer.presetExists'));
    return;
  }
  audio.setEqUserPresets({ ...userPresets.value, [name]: cloneEqBands(bands.value) });
  naming.value = false;
  presetName.value = '';
}
async function deletePreset(name: string) {
  if (!(await prompt.showConfirm(t('equalizer.presetDeleteConfirm', { name })))) return;
  const next = { ...userPresets.value };
  delete next[name];
  audio.setEqUserPresets(next);
}
async function exportEq() {
  try {
    await navigator.clipboard.writeText(
      JSON.stringify({ bands: bands.value, preamp: fx.equalizerPreamp })
    );
  } catch {
    ui.notify('error', t('equalizer.export'), t('equalizer.exportError'));
  }
}
async function importEq() {
  try {
    const text = await navigator.clipboard.readText();
    const parsed = JSON.parse(text) as { bands?: unknown; preamp?: unknown };
    const importedBands = sanitizeEqBands(parsed.bands);
    if (!importedBands || importedBands.length === 0) {
      ui.notify('error', t('equalizer.import'), t('equalizer.importError'));
      return;
    }
    commit(importedBands);
    const preamp = sanitizeEqPreamp(parsed.preamp);
    if (preamp !== undefined) audio.setEqPreamp(preamp);
  } catch {
    ui.notify('error', t('equalizer.import'), t('equalizer.importError'));
  }
}
onMounted(() => {
  raf = requestAnimationFrame(tick);
});
onUnmounted(() => cancelAnimationFrame(raf));
</script>

<template>
  <div
    ref="panel"
    data-testid="equalizer"
    class="bg-base-100 border border-base-300 rounded-box p-4 w-135 max-w-[95vw]"
  >
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-1.5">
        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="fx.equalizerEnabled ? 'text-primary-text' : 'text-base-content/55'"
          data-testid="eq-power"
          :title="fx.equalizerEnabled ? $t('equalizer.disable') : $t('equalizer.enable')"
          :aria-label="fx.equalizerEnabled ? $t('equalizer.disable') : $t('equalizer.enable')"
          :aria-pressed="fx.equalizerEnabled"
          @click="audio.setEqEnabled(!fx.equalizerEnabled)"
        >
          <Power :size="14" />
        </button>
        <h3 class="text-sm font-semibold">{{ $t('equalizer.title') }}</h3>
      </div>
      <div class="flex items-center gap-1">
        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="fx.equalizerMono ? 'text-primary-text' : 'text-base-content/50'"
          data-testid="eq-mono"
          :title="$t('equalizer.mono')"
          :aria-label="$t('equalizer.mono')"
          :aria-pressed="fx.equalizerMono"
          @click="audio.setEqMono(!fx.equalizerMono)"
        >
          <Combine :size="14" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="fx.nightMode ? 'text-primary-text' : 'text-base-content/50'"
          data-testid="eq-night"
          :title="$t('player.nightMode')"
          :aria-label="$t('player.nightMode')"
          :aria-pressed="fx.nightMode"
          @click="audio.setNightMode(!fx.nightMode)"
        >
          <Moon :size="14" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="fx.equalizerSnap ? 'text-primary-text' : 'text-base-content/50'"
          data-testid="eq-snap"
          :title="$t('equalizer.snap')"
          :aria-label="$t('equalizer.snap')"
          :aria-pressed="fx.equalizerSnap"
          @click="audio.setEqSnap(!fx.equalizerSnap)"
        >
          <Magnet :size="14" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="fx.equalizerMulticolor ? 'text-primary-text' : 'text-base-content/50'"
          data-testid="eq-multicolor"
          :title="$t('equalizer.multicolor')"
          :aria-label="$t('equalizer.multicolor')"
          :aria-pressed="fx.equalizerMulticolor"
          @click="audio.setEqMulticolor(!fx.equalizerMulticolor)"
        >
          <Palette :size="14" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:bg-base-content/10 hover:text-base-content transition-colors disabled:opacity-30"
          data-testid="eq-add-band"
          :title="$t('equalizer.addBand')"
          :aria-label="$t('equalizer.addBand')"
          :disabled="bands.length >= limits.maxBands"
          @click="addBand"
        >
          <Plus :size="14" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="showControls ? 'text-primary-text' : 'text-base-content/50'"
          data-testid="eq-toggle-controls"
          :title="showControls ? $t('equalizer.hideControls') : $t('equalizer.showControls')"
          :aria-label="showControls ? $t('equalizer.hideControls') : $t('equalizer.showControls')"
          @click="showControls = !showControls"
        >
          <SlidersHorizontal :size="14" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:bg-base-content/10 hover:text-base-content transition-colors"
          :title="$t('equalizer.reset')"
          :aria-label="$t('equalizer.reset')"
          @click="selectPreset('flat')"
        >
          <RotateCcw :size="14" />
        </button>
      </div>
    </div>

    <!-- preamp -->
    <div class="flex items-center gap-2 mb-3">
      <span class="text-[11px] text-base-content/50 shrink-0">{{ $t('equalizer.preamp') }}</span>
      <input
        type="range"
        min="-12"
        max="12"
        step="1"
        :value="fx.equalizerPreamp"
        data-testid="eq-preamp"
        :aria-label="$t('equalizer.preamp')"
        class="flex-1 h-1 cursor-pointer accent-primary"
        @input="audio.setEqPreamp(Number(($event.target as HTMLInputElement).value))"
      />
      <span class="w-14 text-right text-[11px] font-mono tabular-nums text-base-content/70"
        >{{ fx.equalizerPreamp > 0 ? '+' : '' }}{{ fx.equalizerPreamp }}
        {{ $t('equalizer.db') }}</span
      >
    </div>

    <!-- opóźnienie dźwięku (kompensacja lip-sync) -->
    <div class="flex items-center gap-2 mb-3">
      <span class="text-[11px] text-base-content/50 shrink-0">{{
        $t('equalizer.audioDelay')
      }}</span>
      <input
        type="range"
        min="0"
        max="500"
        step="10"
        :value="fx.audioDelayMs"
        data-testid="eq-audio-delay"
        :aria-label="$t('equalizer.audioDelay')"
        class="flex-1 h-1 cursor-pointer accent-primary"
        @input="audio.setAudioDelay(Number(($event.target as HTMLInputElement).value))"
      />
      <span class="w-14 text-right text-[11px] font-mono tabular-nums text-base-content/70"
        >{{ fx.audioDelayMs }} {{ $t('equalizer.ms') }}</span
      >
    </div>

    <!-- presety (wbudowane + własne) -->
    <div class="flex flex-wrap gap-1.5 mb-3">
      <button
        v-for="(_, name) in EQUALIZER_PRESETS"
        :key="name"
        :data-testid="'eq-preset-' + name"
        class="fx-noise px-2.5 py-1 fx-depth rounded-field text-[11px] font-medium transition-colors"
        :class="
          activePreset === name
            ? 'bg-primary text-primary-content'
            : 'bg-base-300 text-base-content/70 hover:bg-base-content/10'
        "
        @click="selectPreset(name)"
      >
        {{ presetLabels[name] || name }}
      </button>
      <button
        v-for="(_, name) in userPresets"
        :key="'u-' + name"
        :data-testid="'eq-user-preset-' + name"
        class="fx-noise px-2.5 py-1 fx-depth rounded-field text-[11px] font-medium transition-colors border border-primary/40"
        :class="
          activePreset === name
            ? 'bg-primary text-primary-content'
            : 'bg-primary/10 text-primary-text'
        "
        @click="selectPreset(name)"
        @contextmenu.prevent="deletePreset(name)"
      >
        {{ name }}
      </button>
      <span
        v-if="activePreset === 'custom'"
        data-testid="eq-preset-custom"
        class="px-2.5 py-1 rounded-field text-[11px] font-medium bg-primary/15 text-primary-text border border-primary/40"
      >
        {{ $t('equalizer.custom') }}
      </span>
      <button
        class="fx-noise px-2 py-1 fx-depth rounded-field text-[11px] text-base-content/60 hover:text-base-content transition-colors"
        data-testid="eq-save-preset"
        :title="$t('equalizer.savePreset')"
        @click="savePreset"
      >
        <Save :size="12" />
      </button>
      <button
        class="fx-noise px-2 py-1 fx-depth rounded-field text-[11px] text-base-content/60 hover:text-base-content transition-colors"
        data-testid="eq-export"
        :title="$t('equalizer.export')"
        @click="exportEq"
      >
        <Download :size="12" />
      </button>
      <button
        class="fx-noise px-2 py-1 fx-depth rounded-field text-[11px] text-base-content/60 hover:text-base-content transition-colors"
        data-testid="eq-import"
        :title="$t('equalizer.import')"
        @click="importEq"
      >
        <Upload :size="12" />
      </button>
    </div>

    <!-- nazwa nowego presetu (zamiast window.prompt, którego Electron nie wspiera) -->
    <div
      v-if="naming"
      class="flex items-center gap-2 mb-3"
      data-testid="eq-preset-name"
      @keydown.esc="naming = false"
    >
      <input
        v-model="presetName"
        type="text"
        :aria-label="$t('equalizer.presetName')"
        :placeholder="$t('equalizer.presetName')"
        class="flex-1 min-w-0 px-2 py-1 rounded-field bg-base-100 border border-base-300 text-xs focus:border-primary focus:outline-none"
        data-testid="eq-preset-name-input"
        @keydown.enter="confirmSavePreset"
      />
      <button
        type="button"
        class="fx-noise px-2.5 py-1 fx-depth rounded-field bg-primary text-primary-content text-[11px] font-medium transition-colors disabled:opacity-40"
        :disabled="!canSavePreset"
        data-testid="eq-preset-name-confirm"
        @click="confirmSavePreset"
      >
        {{ $t('equalizer.savePreset') }}
      </button>
      <button
        type="button"
        class="fx-noise px-2.5 py-1 fx-depth rounded-field bg-base-300 text-base-content/70 text-[11px] font-medium transition-colors"
        data-testid="eq-preset-name-cancel"
        @click="naming = false"
      >
        {{ $t('common.cancel') }}
      </button>
    </div>

    <!-- krzywa -->
    <div
      ref="curveEl"
      class="relative z-30 rounded-field border border-base-300 bg-base-200/(--glass-alpha) mb-3"
      data-testid="eq-curve"
      @dblclick="onCurveDblClick"
    >
      <svg
        :viewBox="`0 0 ${CURVE.width} ${CURVE.height}`"
        preserveAspectRatio="none"
        class="w-full h-32 block"
        aria-hidden="true"
      >
        <!-- siatka dB -->
        <line
          v-for="db in GRID_DBS"
          :key="'d' + db"
          x1="0"
          :y1="dbToY(db)"
          :x2="CURVE.width"
          :y2="dbToY(db)"
          class="stroke-base-content/10"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
        <!-- siatka częstotliwości -->
        <line
          v-for="f in GRID_FREQS"
          :key="'f' + f"
          :x1="(freqToRatio(f, CURVE.minFreq, CURVE.maxFreq) * CURVE.width).toFixed(1)"
          y1="0"
          :x2="(freqToRatio(f, CURVE.minFreq, CURVE.maxFreq) * CURVE.width).toFixed(1)"
          :y2="CURVE.height"
          class="stroke-base-content/10"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
        <line
          x1="0"
          :y1="zeroLineY"
          :x2="CURVE.width"
          :y2="zeroLineY"
          class="stroke-base-content/25"
          stroke-width="1"
          stroke-dasharray="3 3"
          vector-effect="non-scaling-stroke"
        />
        <path v-if="spectrumPath" :d="spectrumPath" class="fill-base-content/10" stroke="none" />
        <path
          :d="curvePath"
          fill="none"
          class="stroke-primary-text"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      <!-- etykiety siatki -->
      <span class="absolute left-1 top-0.5 text-[10px] text-base-content/55">+18</span>
      <span class="absolute left-1 bottom-0.5 text-[10px] text-base-content/55">-18</span>
      <span
        v-for="f in GRID_FREQS"
        :key="'lf' + f"
        class="absolute bottom-0.5 text-[10px] text-base-content/55 -translate-x-1/2"
        :style="{ left: freqToRatio(f, CURVE.minFreq, CURVE.maxFreq) * 100 + '%' }"
        >{{ f >= 1000 ? f / 1000 + 'k' : f }}</span
      >

      <!-- kropki pasm -->
      <button
        v-for="(band, i) in bands"
        :key="'m' + i"
        type="button"
        class="absolute w-5 h-5 flex items-center justify-center text-[10px] font-bold text-base-100 shadow cursor-grab active:cursor-grabbing"
        :style="{
          left: bandX(band.frequency) + '%',
          top: bandY(band.gain + fx.equalizerPreamp) + '%',
          backgroundColor: color(i),
          borderRadius: markerRadius(band.type),
          opacity: band.enabled === false ? 0.35 : 1,
          transform: `translate(-50%, -50%) scale(${hoverBand === i || draggingBand === i ? 1.3 : 1})`,
          zIndex: hoverBand === i || draggingBand === i ? 5 : 1
        }"
        :title="typeLabel(band.type)"
        :aria-label="`${t('equalizer.band')} ${i + 1} — ${typeLabel(band.type)}`"
        @pointerdown="(e: PointerEvent) => onCurveDown(i, e)"
        @pointermove="onCurveMove"
        @pointerup="onCurveUp"
        @pointercancel="onCurveUp"
        @dblclick.stop="onMarkerDblClick(i)"
        @contextmenu="onMarkerContext($event, i)"
        @mouseenter="hoverBand = i"
        @mouseleave="hoverBand = null"
      >
        {{ i + 1 }}
      </button>

      <!-- menu kontekstowe kropki -->
      <div
        v-if="menuBand !== null"
        class="absolute z-50 w-36 p-1 rounded-field border border-base-300 bg-base-100 fx-depth text-[11px]"
        :style="{
          left: bandX(bands[menuBand].frequency) + '%',
          top: bandY(bands[menuBand].gain + fx.equalizerPreamp) + '%',
          transform: menuBelow ? 'translate(-50%, 14px)' : 'translate(-50%, calc(-100% - 14px))'
        }"
        @click.stop
      >
        <button
          v-for="tp in bandTypes"
          :key="tp"
          class="w-full text-left px-2 py-1 rounded-field hover:bg-base-content/10 transition-colors"
          :class="{ 'text-primary-text': bands[menuBand].type === tp }"
          @click="setType(menuBand, tp)"
        >
          {{ typeLabel(tp) }}
        </button>
        <div class="my-0.5 border-t border-base-300" />
        <button
          class="w-full text-left px-2 py-1 rounded-field text-error hover:bg-base-content/10 transition-colors"
          :disabled="bands.length <= 1"
          @click="removeBand(menuBand)"
        >
          {{ $t('equalizer.removeBand') }}
        </button>
      </div>
    </div>

    <!-- pasma -->
    <div v-if="showControls" class="space-y-2 max-h-72 overflow-auto pr-1">
      <div
        v-for="(band, i) in bands"
        :key="i"
        data-testid="eq-band-row"
        class="rounded-field bg-base-200/(--glass-alpha) p-2 transition-colors"
        :class="{ 'opacity-50': band.enabled === false }"
        :style="{
          backgroundColor: hoverBand === i ? `color-mix(in srgb, ${color(i)} 8%, transparent)` : ''
        }"
        @mouseenter="hoverBand = i"
        @mouseleave="hoverBand = null"
      >
        <div class="flex items-center gap-2">
          <span
            class="shrink-0 w-4 h-4 flex items-center justify-center text-[10px] font-bold text-base-100"
            :style="{ backgroundColor: color(i), borderRadius: markerRadius(band.type) }"
            aria-hidden="true"
            >{{ i + 1 }}</span
          >
          <select
            :value="band.type"
            :data-testid="'eq-type-' + i"
            :aria-label="$t('equalizer.type')"
            class="shrink-0 w-28 px-1.5 py-1 rounded-field bg-base-100 border border-base-300 text-[11px] focus:border-primary focus:outline-none"
            @change="
              patchBand(i, { type: ($event.target as HTMLSelectElement).value as EqBandType })
            "
          >
            <option v-for="tp in bandTypes" :key="tp" :value="tp">{{ typeLabel(tp) }}</option>
          </select>
          <button
            type="button"
            class="ml-auto shrink-0 p-1 rounded-field transition-colors"
            :class="
              band.enabled === false
                ? 'text-base-content/55 hover:text-base-content/60'
                : 'text-primary-text hover:bg-base-content/10'
            "
            :data-testid="'eq-enable-' + i"
            :title="$t('equalizer.bandEnabled')"
            :aria-label="$t('equalizer.bandEnabled')"
            :aria-pressed="band.enabled !== false"
            @click="patchBand(i, { enabled: band.enabled === false })"
          >
            <Power :size="13" />
          </button>
          <button
            type="button"
            class="shrink-0 px-1.5 py-1 rounded-field text-[11px] font-bold transition-colors"
            :class="
              solo === i
                ? 'bg-primary text-primary-content'
                : 'text-base-content/55 hover:text-base-content hover:bg-base-content/10'
            "
            :data-testid="'eq-solo-' + i"
            :title="$t('equalizer.solo')"
            :aria-label="$t('equalizer.solo')"
            :aria-pressed="solo === i"
            @click="toggleSolo(i)"
          >
            S
          </button>
          <button
            type="button"
            class="shrink-0 p-1 rounded-field text-base-content/55 hover:text-error hover:bg-base-content/10 transition-colors disabled:opacity-30"
            :disabled="bands.length <= 1"
            :data-testid="'eq-remove-' + i"
            :aria-label="$t('equalizer.removeBand')"
            @click="removeBand(i)"
          >
            <Trash2 :size="13" />
          </button>
        </div>

        <div class="flex items-center gap-2 mt-1.5 pl-6">
          <span class="w-3 text-[11px] text-base-content/50">F</span>
          <input
            type="range"
            :min="0"
            :max="1"
            step="0.001"
            :value="freqToRatio(band.frequency, limits.minFrequency, limits.maxFrequency)"
            :data-testid="'eq-freq-' + i"
            :aria-label="$t('equalizer.frequency')"
            class="flex-1 h-1 cursor-pointer"
            :style="{ accentColor: color(i) }"
            @keydown="onFreqKey($event, i)"
            @input="
              patchBand(i, {
                frequency: Math.round(
                  snap(
                    ratioToFreq(
                      Number(($event.target as HTMLInputElement).value),
                      limits.minFrequency,
                      limits.maxFrequency
                    )
                  )
                )
              })
            "
          />
          <span class="w-18 text-right text-[11px] font-mono tabular-nums text-base-content/60"
            >{{ band.frequency }} {{ $t('equalizer.hz') }}</span
          >
        </div>

        <div v-if="band.type === 'peaking'" class="flex items-center gap-2 mt-1 pl-6">
          <span class="w-3 text-[11px] text-base-content/50">Q</span>
          <input
            type="range"
            :min="limits.minQ"
            :max="limits.maxQ"
            step="0.1"
            :value="band.q"
            :data-testid="'eq-q-' + i"
            :aria-label="$t('equalizer.q')"
            class="flex-1 h-1 cursor-pointer"
            :style="{ accentColor: color(i) }"
            @keydown="onQKey($event, i)"
            @input="
              patchBand(i, {
                q: clamp(
                  Number(($event.target as HTMLInputElement).value),
                  limits.minQ,
                  limits.maxQ
                )
              })
            "
          />
          <span class="w-18 text-right text-[11px] font-mono tabular-nums text-base-content/60">{{
            band.q
          }}</span>
        </div>

        <div v-if="band.type !== 'peaking'" class="flex items-center gap-2 mt-1 pl-6">
          <span class="w-3 text-[11px] text-base-content/50">S</span>
          <input
            type="range"
            min="0.3"
            max="2"
            step="0.1"
            :value="band.slope ?? 1"
            :data-testid="'eq-slope-' + i"
            :aria-label="$t('equalizer.slope')"
            class="flex-1 h-1 cursor-pointer"
            :style="{ accentColor: color(i) }"
            @input="
              patchBand(i, {
                slope: clamp(Number(($event.target as HTMLInputElement).value), 0.3, 2)
              })
            "
          />
          <span class="w-18 text-right text-[11px] font-mono tabular-nums text-base-content/60">{{
            band.slope ?? 1
          }}</span>
        </div>

        <div class="flex items-center gap-2 mt-1 pl-6">
          <span class="w-3 text-[11px] text-base-content/50">G</span>
          <div
            :data-testid="'eq-band-' + i"
            class="flex-1 relative h-4 cursor-pointer flex items-center"
            role="slider"
            tabindex="0"
            :aria-label="`${t('equalizer.band')} ${band.frequency} Hz`"
            :aria-valuemin="limits.minGain"
            :aria-valuemax="limits.maxGain"
            :aria-valuenow="band.gain"
            :aria-valuetext="`${band.gain > 0 ? '+' : ''}${band.gain} dB`"
            @mousedown="onGainDrag($event, i)"
            @keydown="onGainKey($event, i)"
          >
            <div class="absolute left-0 right-0 h-1 rounded-full bg-base-content/15" />
            <div
              class="absolute left-1/2 w-px h-2.5 bg-base-content/40"
              style="transform: translateX(-50%)"
            />
            <div
              class="absolute h-1 rounded-full"
              :style="{
                backgroundColor: color(i),
                left: band.gain >= 0 ? '50%' : gainPct(band.gain) + '%',
                width: (Math.abs(band.gain) / (limits.maxGain - limits.minGain)) * 100 + '%'
              }"
            />
            <div
              class="absolute w-3.5 h-3.5 rounded-full border-2 border-base-100 shadow-md"
              :style="{
                backgroundColor: color(i),
                left: gainPct(band.gain) + '%',
                transform: 'translateX(-50%)'
              }"
            />
          </div>
          <span class="w-18 text-right text-[11px] font-mono tabular-nums text-base-content/60"
            >{{ band.gain > 0 ? '+' : '' }}{{ band.gain }} {{ $t('equalizer.db') }}</span
          >
        </div>
      </div>
    </div>

    <ExplorerPromptDialog
      :visible="prompt.promptVisible.value"
      :is-confirm="prompt.promptIsConfirm.value"
      :message="prompt.promptMessage.value"
      :value="prompt.promptValue.value"
      @update:value="prompt.promptValue.value = $event"
      @confirm="prompt.promptConfirm"
      @cancel="prompt.promptCancel"
    />
  </div>
</template>
