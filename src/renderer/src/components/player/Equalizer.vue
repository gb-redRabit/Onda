<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RotateCcw, Plus, Trash2 } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import {
  EQUALIZER_PRESETS,
  EQUALIZER_PRESET_LABELS,
  EQ_LIMITS,
  cloneEqBands,
  matchesEqPreset,
  type EqBand,
  type EqBandType
} from '@renderer/utils/constants/audio';
import { eqCurvePath, freqToRatio, ratioToFreq } from '@renderer/utils/eqCurve';

// Parametryczny korektor: krzywa charakterystyki + suwaki (częstotliwość/Q) i przeciągalne
// wzmocnienie. Pasma można dodawać i usuwać — użytkownik ma pełną swobodę.

const player = usePlayerStore();
const { applyEqBands } = useAudioPlayer();
const { t } = useI18n();

const panel = ref<HTMLElement | null>(null);

function onClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  if (
    panel.value &&
    !panel.value.contains(target) &&
    !(target as HTMLElement).closest('[data-eq-toggle]')
  ) {
    player.equalizerVisible = false;
  }
}
onMounted(() => document.addEventListener('click', onClickOutside));
onUnmounted(() => document.removeEventListener('click', onClickOutside));

const presets = EQUALIZER_PRESETS;
const bandTypes: EqBandType[] = ['lowshelf', 'peaking', 'highshelf'];
const limits = EQ_LIMITS;

const presetLabels: Record<string, string> = {
  ...EQUALIZER_PRESET_LABELS,
  classical: t('equalizer.classical'),
  bassBoost: t('equalizer.bass'),
  trebleBoost: t('equalizer.treble'),
  vocal: t('equalizer.vocal')
};

const bands = computed(() => player.equalizerBands);

const activePreset = computed(() => {
  for (const name of Object.keys(presets)) {
    if (matchesEqPreset(bands.value, presets[name])) return name;
  }
  return 'custom';
});

// --- krzywa charakterystyki ---
const CURVE = { width: 480, height: 96, minFreq: 20, maxFreq: 20000, minDb: -18, maxDb: 18 };

const curvePath = computed(() => eqCurvePath(bands.value, CURVE));
const zeroLineY = computed(() => (CURVE.maxDb / (CURVE.maxDb - CURVE.minDb)) * CURVE.height);
function markerX(freq: number): number {
  return freqToRatio(freq, CURVE.minFreq, CURVE.maxFreq) * CURVE.width;
}
function markerY(gain: number): number {
  const clamped = Math.max(CURVE.minDb, Math.min(CURVE.maxDb, gain));
  return CURVE.height - ((clamped - CURVE.minDb) / (CURVE.maxDb - CURVE.minDb)) * CURVE.height;
}

function commit(next: EqBand[], preset = 'custom') {
  player.equalizerPreset = preset;
  applyEqBands(next);
}

function selectPreset(name: string) {
  commit(cloneEqBands(presets[name]), name);
}

function patchBand(i: number, patch: Partial<EqBand>) {
  const next = cloneEqBands(bands.value);
  if (!next[i]) return;
  next[i] = { ...next[i], ...patch };
  commit(next);
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
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Klawiaturowy odpowiednik przeciągania wzmocnienia.
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

function onGainDrag(e: MouseEvent, index: number) {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  function update(ev: MouseEvent) {
    const pct = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
    const val = Math.round(pct * (limits.maxGain - limits.minGain) + limits.minGain);
    patchBand(index, { gain: val });
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
</script>

<template>
  <div
    ref="panel"
    data-testid="equalizer"
    class="bg-base-100 border border-base-300 rounded-box p-4 w-130 max-w-[95vw]"
  >
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-semibold">{{ $t('equalizer.title') }}</h3>
      <button
        class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:bg-base-content/10 hover:text-base-content transition-colors"
        :title="$t('equalizer.reset')"
        :aria-label="$t('equalizer.reset')"
        @click="selectPreset('flat')"
      >
        <RotateCcw :size="14" />
      </button>
    </div>

    <!-- presety -->
    <div class="flex flex-wrap gap-1.5 mb-3">
      <button
        v-for="(_, name) in presets"
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
      <span
        v-if="activePreset === 'custom'"
        data-testid="eq-preset-custom"
        class="px-2.5 py-1 rounded-field text-[11px] font-medium bg-primary/15 text-primary border border-primary/40"
      >
        {{ $t('equalizer.custom') }}
      </span>
    </div>

    <!-- krzywa charakterystyki -->
    <div class="rounded-field border border-base-300 bg-base-200/(--glass-alpha) p-1 mb-3">
      <svg
        :viewBox="`0 0 ${CURVE.width} ${CURVE.height}`"
        preserveAspectRatio="none"
        class="w-full h-24"
        data-testid="eq-curve"
        aria-hidden="true"
      >
        <line
          x1="0"
          :y1="zeroLineY"
          :x2="CURVE.width"
          :y2="zeroLineY"
          class="stroke-base-content/20"
          stroke-width="1"
          stroke-dasharray="3 3"
        />
        <path :d="curvePath" fill="none" class="stroke-primary" stroke-width="2" />
        <circle
          v-for="(band, i) in bands"
          :key="'m' + i"
          :cx="markerX(band.frequency)"
          :cy="markerY(band.gain)"
          r="3"
          class="fill-primary stroke-base-100"
          stroke-width="1"
        />
      </svg>
    </div>

    <!-- pasma -->
    <div class="space-y-2.5 max-h-64 overflow-auto pr-1">
      <div v-for="(band, i) in bands" :key="i" data-testid="eq-band-row" class="space-y-1">
        <div class="flex items-center gap-2">
          <select
            :value="band.type"
            :data-testid="'eq-type-' + i"
            :aria-label="$t('equalizer.type')"
            class="shrink-0 w-28 px-1.5 py-1 rounded-field bg-base-200/(--glass-alpha) border border-base-300 text-[11px] focus:border-primary focus:outline-none"
            @change="
              patchBand(i, { type: ($event.target as HTMLSelectElement).value as EqBandType })
            "
          >
            <option v-for="tp in bandTypes" :key="tp" :value="tp">{{ typeLabel(tp) }}</option>
          </select>

          <!-- wzmocnienie: przeciągalny pasek -->
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
              class="absolute h-1 rounded-full bg-primary"
              :style="{
                left: band.gain >= 0 ? '50%' : gainPct(band.gain) + '%',
                width: (Math.abs(band.gain) / (limits.maxGain - limits.minGain)) * 100 + '%'
              }"
            />
            <div
              class="absolute w-3.5 h-3.5 rounded-full bg-primary border border-white shadow-md"
              :style="{ left: gainPct(band.gain) + '%', transform: 'translateX(-50%)' }"
            />
          </div>

          <span
            class="shrink-0 w-14 text-right text-[10px] font-mono tabular-nums text-base-content/70"
            >{{ band.gain > 0 ? '+' : '' }}{{ band.gain }} {{ $t('equalizer.db') }}</span
          >

          <button
            type="button"
            class="shrink-0 p-1 rounded-field text-base-content/40 hover:text-error hover:bg-base-content/10 transition-colors disabled:opacity-30"
            :disabled="bands.length <= 1"
            :data-testid="'eq-remove-' + i"
            :aria-label="$t('equalizer.removeBand')"
            @click="removeBand(i)"
          >
            <Trash2 :size="13" />
          </button>
        </div>

        <!-- częstotliwość + Q: suwaki -->
        <div class="flex items-center gap-3 pl-1">
          <label class="flex-1 flex items-center gap-2">
            <span class="w-3 text-[10px] text-base-content/50">F</span>
            <input
              type="range"
              :min="0"
              :max="1"
              step="0.001"
              :value="freqToRatio(band.frequency, limits.minFrequency, limits.maxFrequency)"
              :data-testid="'eq-freq-' + i"
              :aria-label="$t('equalizer.frequency')"
              class="flex-1 h-1 accent-primary cursor-pointer"
              @input="
                patchBand(i, {
                  frequency: Math.round(
                    ratioToFreq(
                      Number(($event.target as HTMLInputElement).value),
                      limits.minFrequency,
                      limits.maxFrequency
                    )
                  )
                })
              "
            />
            <span class="w-16 text-right text-[10px] font-mono tabular-nums text-base-content/60"
              >{{ band.frequency }} {{ $t('equalizer.hz') }}</span
            >
          </label>
          <label class="w-40 flex items-center gap-2">
            <span class="w-3 text-[10px] text-base-content/50">Q</span>
            <input
              type="range"
              :min="limits.minQ"
              :max="limits.maxQ"
              step="0.1"
              :value="band.q"
              :data-testid="'eq-q-' + i"
              :aria-label="$t('equalizer.q')"
              class="flex-1 h-1 accent-primary cursor-pointer"
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
            <span class="w-8 text-right text-[10px] font-mono tabular-nums text-base-content/60">{{
              band.q
            }}</span>
          </label>
        </div>
      </div>
    </div>

    <button
      type="button"
      data-testid="eq-add-band"
      class="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-field border border-dashed border-base-300 text-[11px] text-base-content/60 hover:text-base-content hover:border-primary/50 transition-colors disabled:opacity-40"
      :disabled="bands.length >= limits.maxBands"
      @click="addBand"
    >
      <Plus :size="13" />{{ $t('equalizer.addBand') }}
    </button>
  </div>
</template>
