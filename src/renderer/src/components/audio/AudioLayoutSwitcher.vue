<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { AUDIO_LAYOUT_PRESETS } from '@renderer/utils/constants';
import type { AudioLayoutPreset } from '@renderer/types/settings';
import { LayoutPanelLeft, AlignVerticalSpaceAround, Columns2, Maximize, Orbit } from '@lucide/vue';

const settings = useSettingsStore();
const current = computed(() => settings.appearance.audioLayout?.preset ?? 'full');

const icons: Record<AudioLayoutPreset, typeof LayoutPanelLeft> = {
  compact: LayoutPanelLeft,
  stacked: AlignVerticalSpaceAround,
  split: Columns2,
  full: Maximize,
  immersive: Orbit
};

function apply(preset: AudioLayoutPreset) {
  settings.applyAudioLayoutPreset(preset);
}
</script>

<template>
  <div class="flex items-center gap-1">
    <button
      v-for="(preset, key) in AUDIO_LAYOUT_PRESETS"
      :key="key"
      class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-all"
      :class="{
        'text-primary bg-primary/10': current === key
      }"
      :title="preset.label"
      @click="apply(key as AudioLayoutPreset)"
    >
      <component :is="icons[key as AudioLayoutPreset]" :size="14" />
    </button>
  </div>
</template>
