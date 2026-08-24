<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import type { VisualizationMode } from '@renderer/types/settings';

const settings = useSettingsStore();
const viz = computed(() => settings.playback.visualization);

const modes: { value: VisualizationMode; label: string }[] = [
  { value: 'bars', label: 'Bars' },
  { value: 'wave', label: 'Wave' },
  { value: 'radial', label: 'Radial' },
  { value: 'circle', label: 'Circle' },
  { value: 'particles', label: 'Particles' }
];

function update(partial: Partial<typeof viz.value>) {
  settings.updatePlayback({ visualization: { ...viz.value, ...partial } });
}
</script>

<template>
  <div class="p-3 bg-base-100 border border-base-300 rounded-box shadow-xl min-w-55 space-y-3">
    <div>
      <label
        class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-1.5 block"
        >{{ $t('audioView.vizModeLabel') }}</label
      >
      <div class="flex flex-wrap gap-1">
        <button
          v-for="m in modes"
          :key="m.value"
          class="fx-noise px-2 py-1 fx-depth rounded-field text-[11px] font-medium transition-colors"
          :class="
            viz.mode === m.value
              ? 'bg-primary text-primary-content'
              : 'bg-base-100 text-base-content/70 hover:text-base-content hover:bg-base-content/10'
          "
          @click="update({ mode: m.value })"
        >
          {{ m.label }}
        </button>
      </div>
    </div>

    <div>
      <label
        class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-1.5 block"
        >{{ $t('audioView.vizPrimaryColor') }}</label
      >
      <div class="flex items-center gap-2">
        <input
          type="color"
          :value="viz.primaryColor"
          class="w-8 h-8 fx-depth rounded-field cursor-pointer border-0 p-0"
          @input="(e: Event) => update({ primaryColor: (e.target as HTMLInputElement).value })"
        />
        <span class="text-[11px] font-mono text-base-content/70">{{ viz.primaryColor }}</span>
      </div>
    </div>

    <div>
      <label
        class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-1.5 block"
        >{{ $t('audioView.vizSecondaryColor') }}</label
      >
      <div class="flex items-center gap-2">
        <input
          type="color"
          :value="viz.secondaryColor"
          class="w-8 h-8 fx-depth rounded-field cursor-pointer border-0 p-0"
          @input="(e: Event) => update({ secondaryColor: (e.target as HTMLInputElement).value })"
        />
        <span class="text-[11px] font-mono text-base-content/70">{{ viz.secondaryColor }}</span>
      </div>
    </div>

    <div>
      <label
        class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-1.5 block"
        >Sensitivity: {{ Math.round(viz.sensitivity * 100) }}%</label
      >
      <input
        type="range"
        min="0.1"
        max="1.5"
        step="0.01"
        :value="viz.sensitivity"
        class="w-full accent-primary"
        @input="
          (e: Event) => update({ sensitivity: parseFloat((e.target as HTMLInputElement).value) })
        "
      />
    </div>
  </div>
</template>
