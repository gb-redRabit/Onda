<script setup lang="ts">
import { HardDrive, Radio, Palette, PictureInPicture } from '@lucide/vue';

const features = [
  { icon: HardDrive, titleKey: 'wizard.featLibrary', descKey: 'wizard.featLibraryDesc' },
  { icon: Radio, titleKey: 'wizard.featStream', descKey: 'wizard.featStreamDesc' },
  { icon: Palette, titleKey: 'wizard.featThemes', descKey: 'wizard.featThemesDesc' },
  { icon: PictureInPicture, titleKey: 'wizard.featPip', descKey: 'wizard.featPipDesc' }
];
</script>

<template>
  <div>
    <h3 class="text-lg font-bold tracking-tight mb-1.5">{{ $t('wizard.title') }}</h3>
    <p class="text-sm text-base-content/70">{{ $t('wizard.welcomeIntro') }}</p>

    <div class="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
  </div>
</template>
