<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { RotateCcw } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { EQUALIZER_PRESETS, EQUALIZER_PRESET_LABELS } from '@renderer/utils/constants';

const player = usePlayerStore();
const { setEqualizerBand, applyEqPreset } = useAudioPlayer();

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

const { t } = useI18n();

const presetLabels: Record<string, string> = {
  ...EQUALIZER_PRESET_LABELS,
  classical: t('equalizer.classical'),
  bassBoost: t('equalizer.bass'),
  trebleBoost: t('equalizer.treble'),
  vocal: t('equalizer.vocal')
};

const bandLabels = ['32', '64', '125', '250', '500', '1K', '2K', '4K', '8K', '16K'];

function selectPreset(name: string) {
  player.equalizerPreset = name;
  applyEqPreset(presets[name]);
}

function onSliderDrag(e: MouseEvent, index: number) {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  function update(ev: MouseEvent) {
    const pct = 1 - Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
    const val = Math.round(pct * 24 - 12);
    setEqualizerBand(index, val);
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

/**
 * Klawiaturowy odpowiednik przeciągania.
 *
 * Każdy pas był divem obsługującym tylko mousedown: bez roli, bez tabindex i bez
 * obsługi klawiszy, więc korektora nie dało się ustawić bez wskaźnika.
 */
function onBandKey(e: KeyboardEvent, index: number) {
  const current = player.equalizerBands[index] ?? 0;
  let next: number | null = null;
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = current + 1;
  else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = current - 1;
  else if (e.key === 'PageUp') next = current + 6;
  else if (e.key === 'PageDown') next = current - 6;
  else if (e.key === 'Home') next = -12;
  else if (e.key === 'End') next = 12;
  else if (e.key === '0') next = 0;
  if (next === null) return;
  e.preventDefault();
  setEqualizerBand(index, Math.max(-12, Math.min(12, next)));
}
</script>

<template>
  <div
    ref="panel"
    data-testid="equalizer"
    class="bg-base-100 border border-base-300 rounded-box p-4 w-95"
  >
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-semibold">{{ $t('equalizer.title') }}</h3>
      <button
        class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:bg-base-content/10 hover:text-base-content transition-colors"
        title="Reset"
        @click="selectPreset('flat')"
      >
        <RotateCcw :size="14" />
      </button>
    </div>

    <!-- presety -->
    <div class="flex flex-wrap gap-1.5 mb-5">
      <button
        v-for="(_, name) in presets"
        :key="name"
        :data-testid="'eq-preset-' + name"
        class="fx-noise px-2.5 py-1 fx-depth rounded-field text-[11px] font-medium transition-colors"
        :class="
          player.equalizerPreset === name
            ? 'bg-primary text-primary-content'
            : 'bg-base-300 text-base-content/70 hover:bg-base-content/10'
        "
        @click="selectPreset(name)"
      >
        {{ presetLabels[name] || name }}
      </button>
    </div>

    <!-- pasma -->
    <div class="flex gap-2 h-48">
      <div v-for="(label, i) in bandLabels" :key="label" class="flex-1 flex flex-col items-center">
        <span
          class="text-[10px] text-base-content/70 font-mono tabular-nums mb-1.5 h-4 leading-4 select-none"
        >
          {{ player.equalizerBands[i] > 0 ? '+' : '' }}{{ player.equalizerBands[i] }}
        </span>
        <div
          :data-testid="'eq-band-' + i"
          class="flex-1 w-full relative cursor-pointer"
          role="slider"
          tabindex="0"
          :aria-label="`${t('equalizer.band')} ${label} Hz`"
          :aria-valuemin="-12"
          :aria-valuemax="12"
          :aria-valuenow="player.equalizerBands[i] ?? 0"
          :aria-valuetext="`${player.equalizerBands[i] > 0 ? '+' : ''}${player.equalizerBands[i] ?? 0} dB`"
          @mousedown="onSliderDrag($event, i)"
          @keydown="onBandKey($event, i)"
        >
          <!-- tło ścieżki — szersze, wysoki kontrast -->
          <div
            class="absolute w-1.25 h-full rounded-full bg-base-content/20"
            style="left: 50%; transform: translateX(-50%)"
          />
          <!-- wypełniona część od środka -->
          <div
            class="absolute w-1.25 rounded-full bg-primary"
            style="left: 50%; transform: translateX(-50%)"
            :style="
              player.equalizerBands[i] >= 0
                ? {
                    top: ((12 - player.equalizerBands[i]) / 24) * 100 + '%',
                    height: (Math.abs(player.equalizerBands[i]) / 24) * 100 + '%'
                  }
                : { top: '50%', height: (Math.abs(player.equalizerBands[i]) / 24) * 100 + '%' }
            "
          />
          <!-- linia środkowa -->
          <div
            class="absolute w-3 h-0.5 rounded-full bg-base-content/70"
            style="left: 50%; transform: translateX(-50%); top: 50%"
          />
          <!-- uchwyt -->
          <div
            class="absolute w-4 h-4 rounded-full bg-primary border border-white shadow-md transition-all duration-75"
            :style="{
              left: '50%',
              top: ((12 - player.equalizerBands[i]) / 24) * 100 + '%',
              transform: 'translate(-50%, -50%)'
            }"
          />
        </div>
        <span class="text-[9px] text-base-content/70 mt-1.5 h-3 leading-3 select-none">{{
          label
        }}</span>
      </div>
    </div>
  </div>
</template>
