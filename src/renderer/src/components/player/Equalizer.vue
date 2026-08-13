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
</script>

<template>
  <div ref="panel" class="bg-bg-elevated border border-border-default rounded-2xl p-4 w-95">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-semibold">{{ $t('equalizer.title') }}</h3>
      <button
        class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover hover:text-fg-base transition-colors"
        title="Reset"
        @click="selectPreset('flat')"
      >
        <RotateCcw :size="14" />
      </button>
    </div>

    <!-- presets -->
    <div class="flex flex-wrap gap-1.5 mb-5">
      <button
        v-for="(_, name) in presets"
        :key="name"
        class="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
        :class="
          player.equalizerPreset === name
            ? 'bg-accent-base text-white'
            : 'bg-bg-overlay text-fg-muted hover:bg-bg-hover'
        "
        @click="selectPreset(name)"
      >
        {{ presetLabels[name] || name }}
      </button>
    </div>

    <!-- bands -->
    <div class="flex gap-2 h-48">
      <div v-for="(label, i) in bandLabels" :key="i" class="flex-1 flex flex-col items-center">
        <span
          class="text-[10px] text-fg-muted font-mono tabular-nums mb-1.5 h-4 leading-4 select-none"
        >
          {{ player.equalizerBands[i] > 0 ? '+' : '' }}{{ player.equalizerBands[i] }}
        </span>
        <div class="flex-1 w-full relative cursor-pointer" @mousedown="onSliderDrag($event, i)">
          <!-- track background — wider, high contrast -->
          <div
            class="absolute w-1.25 h-full rounded-full bg-bg-active"
            style="left: 50%; transform: translateX(-50%)"
          />
          <!-- filled portion from center -->
          <div
            class="absolute w-1.25 rounded-full bg-accent-base"
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
          <!-- center line -->
          <div
            class="absolute w-3 h-0.5 rounded-full bg-fg-faint/70"
            style="left: 50%; transform: translateX(-50%); top: 50%"
          />
          <!-- thumb -->
          <div
            class="absolute w-4 h-4 rounded-full bg-accent-base border-2 border-white shadow-md transition-all duration-75"
            :style="{
              left: '50%',
              top: ((12 - player.equalizerBands[i]) / 24) * 100 + '%',
              transform: 'translate(-50%, -50%)'
            }"
          />
        </div>
        <span class="text-[9px] text-fg-muted mt-1.5 h-3 leading-3 select-none">{{ label }}</span>
      </div>
    </div>
  </div>
</template>
