<script setup lang="ts">
import { Power, Trash2 } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import {
  EQ_LIMITS,
  snapFrequency,
  type EqBand,
  type EqBandType
} from '@renderer/utils/constants/audio';
import { freqToRatio, ratioToFreq } from '@renderer/utils/eqCurve';
import { gainPct, markerRadius } from '@renderer/utils/eqGeometry';

// Wiersz edycji jednego pasma korektora (typ, enable, solo, usuń, F/Q/S/G),
// wyodrębniony z `Equalizer.vue` (plan 2.8). Emituje wyłącznie intencje — stan
// (pasma, solo) należy do rodzica.

const props = defineProps<{
  band: EqBand;
  index: number;
  color: string;
  soloed: boolean;
  hovered: boolean;
  canRemove: boolean;
  snapEnabled: boolean;
  bandTypes: EqBandType[];
  typeLabel: (type: EqBandType) => string;
}>();

const emit = defineEmits<{
  patch: [patch: Partial<EqBand>];
  'toggle-solo': [];
  remove: [];
}>();

const { t } = useI18n();
const limits = EQ_LIMITS;

const snap = (freq: number): number => (props.snapEnabled ? snapFrequency(freq) : freq);
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function onGainKey(e: KeyboardEvent): void {
  const current = props.band.gain ?? 0;
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
  emit('patch', { gain: clamp(next, limits.minGain, limits.maxGain) });
}

function onFreqKey(e: KeyboardEvent): void {
  const b = props.band;
  const step = e.shiftKey ? 1.05 : 1.01;
  let next: number | null = null;
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = b.frequency * step;
  else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = b.frequency / step;
  else if (e.key === 'Home') next = limits.minFrequency;
  else if (e.key === 'End') next = limits.maxFrequency;
  if (next === null) return;
  e.preventDefault();
  emit('patch', {
    frequency: Math.round(snap(clamp(next, limits.minFrequency, limits.maxFrequency)))
  });
}

function onQKey(e: KeyboardEvent): void {
  const b = props.band;
  const step = e.shiftKey ? 1 : 0.1;
  let next: number | null = null;
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = b.q + step;
  else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = b.q - step;
  else if (e.key === 'Home') next = limits.minQ;
  else if (e.key === 'End') next = limits.maxQ;
  if (next === null) return;
  e.preventDefault();
  emit('patch', { q: Math.round(clamp(next, limits.minQ, limits.maxQ) * 10) / 10 });
}

function onGainDrag(e: MouseEvent): void {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  function update(ev: MouseEvent): void {
    const pct = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
    emit('patch', {
      gain: Math.round(pct * (limits.maxGain - limits.minGain) + limits.minGain)
    });
  }
  update(e);
  function onMove(ev: MouseEvent): void {
    update(ev);
  }
  function onUp(): void {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
</script>

<template>
  <div
    data-testid="eq-band-row"
    class="rounded-field bg-base-200/(--glass-alpha) p-2 transition-colors"
    :class="{ 'opacity-50': band.enabled === false }"
    :style="{
      backgroundColor: hovered ? `color-mix(in srgb, ${color} 8%, transparent)` : ''
    }"
  >
    <div class="flex items-center gap-2">
      <span
        class="shrink-0 w-4 h-4 flex items-center justify-center text-3xs font-bold text-base-100"
        :style="{ backgroundColor: color, borderRadius: markerRadius(band.type) }"
        aria-hidden="true"
        >{{ index + 1 }}</span
      >
      <select
        :value="band.type"
        :data-testid="'eq-type-' + index"
        :aria-label="$t('equalizer.type')"
        class="shrink-0 w-28 px-1.5 py-1 rounded-field bg-base-100 border border-base-300 text-2xs focus:border-primary focus:outline-hidden"
        @change="emit('patch', { type: ($event.target as HTMLSelectElement).value as EqBandType })"
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
        :data-testid="'eq-enable-' + index"
        :title="$t('equalizer.bandEnabled')"
        :aria-label="$t('equalizer.bandEnabled')"
        :aria-pressed="band.enabled !== false"
        @click="emit('patch', { enabled: band.enabled === false })"
      >
        <Power :size="13" />
      </button>
      <button
        type="button"
        class="shrink-0 px-1.5 py-1 rounded-field text-2xs font-bold transition-colors"
        :class="
          soloed
            ? 'bg-primary text-primary-content'
            : 'text-base-content/55 hover:text-base-content hover:bg-base-content/10'
        "
        :data-testid="'eq-solo-' + index"
        :title="$t('equalizer.solo')"
        :aria-label="$t('equalizer.solo')"
        :aria-pressed="soloed"
        @click="emit('toggle-solo')"
      >
        S
      </button>
      <button
        type="button"
        class="shrink-0 p-1 rounded-field text-base-content/55 hover:text-error hover:bg-base-content/10 transition-colors disabled:opacity-30"
        :disabled="!canRemove"
        :data-testid="'eq-remove-' + index"
        :aria-label="$t('equalizer.removeBand')"
        @click="emit('remove')"
      >
        <Trash2 :size="13" />
      </button>
    </div>

    <div class="flex items-center gap-2 mt-1.5 pl-6">
      <span class="w-3 text-2xs text-base-content/50">F</span>
      <input
        type="range"
        :min="0"
        :max="1"
        step="0.001"
        :value="freqToRatio(band.frequency, limits.minFrequency, limits.maxFrequency)"
        :data-testid="'eq-freq-' + index"
        :aria-label="$t('equalizer.frequency')"
        class="flex-1 h-1 cursor-pointer"
        :style="{ accentColor: color }"
        @keydown="onFreqKey"
        @input="
          emit('patch', {
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
      <span class="w-18 text-right text-2xs font-mono tabular-nums text-base-content/60"
        >{{ band.frequency }} {{ $t('equalizer.hz') }}</span
      >
    </div>

    <div v-if="band.type === 'peaking'" class="flex items-center gap-2 mt-1 pl-6">
      <span class="w-3 text-2xs text-base-content/50">Q</span>
      <input
        type="range"
        :min="limits.minQ"
        :max="limits.maxQ"
        step="0.1"
        :value="band.q"
        :data-testid="'eq-q-' + index"
        :aria-label="$t('equalizer.q')"
        class="flex-1 h-1 cursor-pointer"
        :style="{ accentColor: color }"
        @keydown="onQKey"
        @input="
          emit('patch', {
            q: clamp(Number(($event.target as HTMLInputElement).value), limits.minQ, limits.maxQ)
          })
        "
      />
      <span class="w-18 text-right text-2xs font-mono tabular-nums text-base-content/60">{{
        band.q
      }}</span>
    </div>

    <div v-if="band.type !== 'peaking'" class="flex items-center gap-2 mt-1 pl-6">
      <span class="w-3 text-2xs text-base-content/50">S</span>
      <input
        type="range"
        min="0.3"
        max="2"
        step="0.1"
        :value="band.slope ?? 1"
        :data-testid="'eq-slope-' + index"
        :aria-label="$t('equalizer.slope')"
        class="flex-1 h-1 cursor-pointer"
        :style="{ accentColor: color }"
        @input="
          emit('patch', { slope: clamp(Number(($event.target as HTMLInputElement).value), 0.3, 2) })
        "
      />
      <span class="w-18 text-right text-2xs font-mono tabular-nums text-base-content/60">{{
        band.slope ?? 1
      }}</span>
    </div>

    <div class="flex items-center gap-2 mt-1 pl-6">
      <span class="w-3 text-2xs text-base-content/50">G</span>
      <div
        :data-testid="'eq-band-' + index"
        class="flex-1 relative h-4 cursor-pointer flex items-center"
        role="slider"
        tabindex="0"
        :aria-label="`${t('equalizer.band')} ${band.frequency} Hz`"
        :aria-valuemin="limits.minGain"
        :aria-valuemax="limits.maxGain"
        :aria-valuenow="band.gain"
        :aria-valuetext="`${band.gain > 0 ? '+' : ''}${band.gain} dB`"
        @mousedown="onGainDrag"
        @keydown="onGainKey"
      >
        <div class="absolute left-0 right-0 h-1 rounded-full bg-base-content/15" />
        <div
          class="absolute left-1/2 w-px h-2.5 bg-base-content/40"
          style="transform: translateX(-50%)"
        />
        <div
          class="absolute h-1 rounded-full"
          :style="{
            backgroundColor: color,
            left: band.gain >= 0 ? '50%' : gainPct(band.gain, limits.minGain, limits.maxGain) + '%',
            width: (Math.abs(band.gain) / (limits.maxGain - limits.minGain)) * 100 + '%'
          }"
        />
        <div
          class="absolute w-3.5 h-3.5 rounded-full border-2 border-base-100 shadow-md"
          :style="{
            backgroundColor: color,
            left: gainPct(band.gain, limits.minGain, limits.maxGain) + '%',
            transform: 'translateX(-50%)'
          }"
        />
      </div>
      <span class="w-18 text-right text-2xs font-mono tabular-nums text-base-content/60"
        >{{ band.gain > 0 ? '+' : '' }}{{ band.gain }} {{ $t('equalizer.db') }}</span
      >
    </div>
  </div>
</template>
