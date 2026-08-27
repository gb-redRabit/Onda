<script setup lang="ts">
import { Gauge, LayoutGrid, Maximize2, Pencil } from '@lucide/vue';

const features = [
  {
    icon: Gauge,
    titleKey: 'wizard.audioViz',
    descKey: 'wizard.audioVizDesc'
  },
  {
    icon: LayoutGrid,
    titleKey: 'wizard.audioLayout',
    descKey: 'wizard.audioLayoutDesc'
  },
  {
    icon: Maximize2,
    titleKey: 'wizard.audioFullscreen',
    descKey: 'wizard.audioFullscreenDesc'
  },
  {
    icon: Pencil,
    titleKey: 'wizard.audioEditor',
    descKey: 'wizard.audioEditorDesc'
  }
];
</script>

<template>
  <div>
    <h3 class="text-lg font-bold tracking-tight mb-1.5">{{ $t('wizard.audioTitle') }}</h3>
    <p class="text-sm text-base-content/70 mb-5">{{ $t('wizard.audioDesc') }}</p>

    <div class="space-y-2.5">
      <div
        v-for="f in features"
        :key="f.titleKey"
        class="flex items-start gap-3 p-3.5 fx-depth rounded-box border border-base-300 bg-base-200/[var(--glass-alpha)]"
      >
        <span
          class="w-9 h-9 shrink-0 rounded-field bg-primary/15 text-primary flex items-center justify-center"
        >
          <component :is="f.icon" :size="17" />
        </span>
        <div class="min-w-0">
          <div class="text-sm font-medium">{{ $t(f.titleKey) }}</div>
          <p class="text-xs text-base-content/55 mt-0.5 leading-relaxed">{{ $t(f.descKey) }}</p>
        </div>
      </div>
    </div>

    <p class="mt-4 text-xs text-base-content/50 leading-relaxed">{{ $t('wizard.audioNote') }}</p>
  </div>
</template>
