<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RotateCcw, Plus, Trash2, SlidersHorizontal, Eye } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import {
  EQUALIZER_PRESETS,
  EQUALIZER_PRESET_LABELS,
  EQ_LIMITS,
  cloneEqBands,
  eqBandColor,
  matchesEqPreset,
  type EqBand,
  type EqBandType
} from '@renderer/utils/constants/audio';
import { eqCurvePath, freqToRatio, ratioToFreq } from '@renderer/utils/eqCurve';

// Parametryczny korektor: krzywa charakterystyki z PRZECIĄGALNYMI kropkami (X = częstotliwość,
// Y = wzmocnienie). Kolor i KSZTAŁT kropki zależą od typu pasma; suwaki można ukryć.

const player = usePlayerStore();
const { applyEqBands } = useAudioPlayer();
const { t } = useI18n();

const panel = ref<HTMLElement | null>(null);
const showControls = ref(true);

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
const color = (i: number) => eqBandColor(i);
// Kształt kropki zależy od typu: peak = koło, półka niska = kopuła, półka wysoka = miska.
const markerRadius = (type: EqBandType): string =>
  type === 'lowshelf' ? '50% 50% 18% 18%' : type === 'highshelf' ? '18% 18% 50% 50%' : '50%';

const activePreset = computed(() => {
  for (const name of Object.keys(presets)) {
    if (matchesEqPreset(bands.value, presets[name])) return name;
  }
  return 'custom';
});

// --- krzywa ---
const CURVE = { width: 480, height: 110, minFreq: 20, maxFreq: 20000, minDb: -18, maxDb: 18 };
const curvePath = computed(() => eqCurvePath(bands.value, CURVE));
const zeroLineY = CURVE.height - ((0 - CURVE.minDb) / (CURVE.maxDb - CURVE.minDb)) * CURVE.height;
const bandX = (freq: number) => freqToRatio(freq, CURVE.minFreq, CURVE.maxFreq) * 100;
const bandY = (gain: number) =>
  ((CURVE.maxDb - Math.max(CURVE.minDb, Math.min(CURVE.maxDb, gain))) /
    (CURVE.maxDb - CURVE.minDb)) *
  100;

const curveEl = ref<HTMLElement | null>(null);
const draggingBand = ref<number | null>(null);
const hoverBand = ref<number | null>(null);

function onCurveDown(i: number, e: PointerEvent) {
  e.preventDefault();
  e.stopPropagation();
  draggingBand.value = i;
  (e.currentTarget as Element).setPointerCapture(e.pointerId);
}
function onCurveMove(e: PointerEvent) {
  const i = draggingBand.value;
  const el = curveEl.value;
  if (i === null || !el) return;
  const rect = el.getBoundingClientRect();
  const rx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const ry = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  patchBand(i, {
    frequency: Math.round(ratioToFreq(rx, CURVE.minFreq, CURVE.maxFreq)),
    gain: Math.round(CURVE.maxDb - ry * (CURVE.maxDb - CURVE.minDb))
  });
}
function onCurveUp() {
  draggingBand.value = null;
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
</script>

<template>
  <div
    ref="panel"
    data-testid="equalizer"
    class="bg-base-100 border border-base-300 rounded-box p-4 w-135 max-w-[95vw]"
  >
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-semibold">{{ $t('equalizer.title') }}</h3>
      <div class="flex items-center gap-1">
        <button
          class="fx-noise p-1.5 fx-depth rounded-field transition-colors"
          :class="showControls ? 'text-primary' : 'text-base-content/50'"
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

    <!-- krzywa z przeciągalnymi kropkami -->
    <div
      ref="curveEl"
      class="relative rounded-field border border-base-300 bg-base-200/(--glass-alpha) mb-3 overflow-hidden"
      data-testid="eq-curve"
    >
      <svg
        :viewBox="`0 0 ${CURVE.width} ${CURVE.height}`"
        preserveAspectRatio="none"
        class="w-full h-32 block"
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
          vector-effect="non-scaling-stroke"
        />
        <path
          :d="curvePath"
          fill="none"
          class="stroke-primary"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      <!-- kropki pasm (HTML — nie są rozciągane); kształt zależy od typu -->
      <button
        v-for="(band, i) in bands"
        :key="'m' + i"
        type="button"
        class="absolute w-4 h-4 border-2 border-base-100 shadow cursor-grab active:cursor-grabbing"
        :style="{
          left: bandX(band.frequency) + '%',
          top: bandY(band.gain) + '%',
          backgroundColor: color(i),
          borderRadius: markerRadius(band.type),
          transform: `translate(-50%, -50%) scale(${hoverBand === i || draggingBand === i ? 1.4 : 1})`,
          zIndex: hoverBand === i || draggingBand === i ? 5 : 1
        }"
        :title="typeLabel(band.type)"
        :aria-label="`${t('equalizer.band')} ${i + 1} — ${typeLabel(band.type)}`"
        @pointerdown="(e: PointerEvent) => onCurveDown(i, e)"
        @pointermove="onCurveMove"
        @pointerup="onCurveUp"
        @pointercancel="onCurveUp"
        @mouseenter="hoverBand = i"
        @mouseleave="hoverBand = null"
      />
    </div>

    <!-- pasma -->
    <div v-if="showControls" class="space-y-2 max-h-72 overflow-auto pr-1">
      <div
        v-for="(band, i) in bands"
        :key="i"
        data-testid="eq-band-row"
        class="rounded-field border border-base-300 bg-base-200/(--glass-alpha) p-2 transition-colors"
        :style="{
          borderLeftWidth: '3px',
          borderLeftColor: color(i),
          backgroundColor: hoverBand === i ? `color-mix(in srgb, ${color(i)} 8%, transparent)` : ''
        }"
        @mouseenter="hoverBand = i"
        @mouseleave="hoverBand = null"
      >
        <div class="flex items-center gap-2">
          <span
            class="shrink-0 w-3 h-3 border border-base-100"
            :style="{ backgroundColor: color(i), borderRadius: markerRadius(band.type) }"
            aria-hidden="true"
          />
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
            class="ml-auto shrink-0 p-1 rounded-field text-base-content/40 hover:text-error hover:bg-base-content/10 transition-colors disabled:opacity-30"
            :disabled="bands.length <= 1"
            :data-testid="'eq-remove-' + i"
            :aria-label="$t('equalizer.removeBand')"
            @click="removeBand(i)"
          >
            <Trash2 :size="13" />
          </button>
        </div>

        <!-- częstotliwość -->
        <div class="flex items-center gap-2 mt-1.5 pl-5">
          <span class="w-3 text-[10px] text-base-content/50">F</span>
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
          <span class="w-18 text-right text-[10px] font-mono tabular-nums text-base-content/60"
            >{{ band.frequency }} {{ $t('equalizer.hz') }}</span
          >
        </div>

        <!-- dobroć -->
        <div class="flex items-center gap-2 mt-1 pl-5">
          <span class="w-3 text-[10px] text-base-content/50">Q</span>
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
          <span class="w-18 text-right text-[10px] font-mono tabular-nums text-base-content/60">{{
            band.q
          }}</span>
        </div>

        <!-- wzmocnienie: przeciągalny pasek -->
        <div class="flex items-center gap-2 mt-1 pl-5">
          <span class="w-3 text-[10px] text-base-content/50">G</span>
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
          <span class="w-18 text-right text-[10px] font-mono tabular-nums text-base-content/60"
            >{{ band.gain > 0 ? '+' : '' }}{{ band.gain }} {{ $t('equalizer.db') }}</span
          >
        </div>
      </div>

      <button
        type="button"
        data-testid="eq-add-band"
        class="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-field border border-dashed border-base-300 text-[11px] text-base-content/60 hover:text-base-content hover:border-primary/50 transition-colors disabled:opacity-40"
        :disabled="bands.length >= limits.maxBands"
        @click="addBand"
      >
        <Plus :size="13" />{{ $t('equalizer.addBand') }}
      </button>
    </div>

    <!-- podpowiedź, gdy suwaki ukryte -->
    <p
      v-else
      class="flex items-center justify-center gap-1.5 text-[10px] text-base-content/40"
      data-testid="eq-chart-only"
    >
      <Eye :size="12" />{{ $t('equalizer.showControls') }}
    </p>
  </div>
</template>
