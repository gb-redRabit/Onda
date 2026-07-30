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
  <div class="p-3 bg-bg-surface border border-border-default rounded-xl shadow-xl min-w-[220px] space-y-3">
    <div>
      <label class="text-[10px] font-semibold uppercase tracking-wider text-fg-faint mb-1.5 block">Mode</label>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="m in modes"
          :key="m.value"
          class="px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
          :class="viz.mode === m.value ? 'bg-accent-base text-white' : 'bg-bg-elevated text-fg-muted hover:text-fg-base hover:bg-bg-hover'"
          @click="update({ mode: m.value })"
        >
          {{ m.label }}
        </button>
      </div>
    </div>

    <div>
      <label class="text-[10px] font-semibold uppercase tracking-wider text-fg-faint mb-1.5 block">Primary color</label>
      <div class="flex items-center gap-2">
        <input type="color" :value="viz.primaryColor" class="w-8 h-8 rounded cursor-pointer border-0 p-0" @input="(e: Event) => update({ primaryColor: (e.target as HTMLInputElement).value })" />
        <span class="text-[11px] font-mono text-fg-muted">{{ viz.primaryColor }}</span>
      </div>
    </div>

    <div>
      <label class="text-[10px] font-semibold uppercase tracking-wider text-fg-faint mb-1.5 block">Secondary color</label>
      <div class="flex items-center gap-2">
        <input type="color" :value="viz.secondaryColor" class="w-8 h-8 rounded cursor-pointer border-0 p-0" @input="(e: Event) => update({ secondaryColor: (e.target as HTMLInputElement).value })" />
        <span class="text-[11px] font-mono text-fg-muted">{{ viz.secondaryColor }}</span>
      </div>
    </div>

    <div>
      <label class="text-[10px] font-semibold uppercase tracking-wider text-fg-faint mb-1.5 block">Sensitivity: {{ Math.round(viz.sensitivity * 100) }}%</label>
      <input type="range" min="0.1" max="1.5" step="0.01" :value="viz.sensitivity" class="w-full accent-accent-base" @input="(e: Event) => update({ sensitivity: parseFloat((e.target as HTMLInputElement).value) })" />
    </div>
  </div>
</template>
