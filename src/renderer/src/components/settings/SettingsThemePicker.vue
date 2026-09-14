<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import {
  resolveThemeAppearance,
  BUILTIN_THEMES,
  BUILTIN_THEME_NAMES
} from '@shared/builtin-themes';

const settings = useSettingsStore();
const isCustom = computed(() => settings.appearance.theme === 'custom');
const resolved = computed(() => resolveThemeAppearance(settings.appearance));
</script>

<template>
  <div class="xl:w-64 shrink-0 flex xl:flex-col gap-2.5 overflow-x-auto pb-1">
    <button
      v-for="name in BUILTIN_THEME_NAMES"
      :key="name"
      class="fx-noise p-3 fx-depth rounded-field border transition-all flex items-center gap-4 text-left shrink-0 xl:w-full hover:shadow-md"
      :class="
        settings.appearance.theme === name
          ? 'border-primary bg-primary/5'
          : 'border-base-300 hover:border-primary/40'
      "
      @click="settings.updateAppearance({ theme: name })"
    >
      <span
        class="w-16 h-10 rounded-field shrink-0 flex items-center justify-center gap-2 px-2"
        :style="{ backgroundColor: BUILTIN_THEMES[name].colors.base200 }"
      >
        <span
          class="w-7 h-4 rounded-field"
          :style="{ backgroundColor: BUILTIN_THEMES[name].colors.base100 }"
        />
        <span
          class="w-3.5 h-3.5 rounded-full shrink-0"
          :style="{ backgroundColor: BUILTIN_THEMES[name].colors.primary }"
        />
      </span>
      <span class="text-sm font-medium whitespace-nowrap">{{ $t(`settings.${name}`) }}</span>
    </button>
    <button
      class="fx-noise p-3 fx-depth rounded-field border transition-all flex items-center gap-4 text-left shrink-0 xl:w-full hover:shadow-md"
      :class="isCustom ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-primary/40'"
      @click="settings.updateAppearance({ theme: 'custom' })"
    >
      <span
        class="w-16 h-10 rounded-field shrink-0 flex items-center justify-center gap-2 px-2"
        :style="{ backgroundColor: resolved.colors.base200 }"
      >
        <span class="w-7 h-4 rounded-field" :style="{ backgroundColor: resolved.colors.base100 }" />
        <span
          class="w-3.5 h-3.5 rounded-full shrink-0"
          :style="{ backgroundColor: resolved.colors.primary }"
        />
      </span>
      <span class="text-sm font-medium whitespace-nowrap">{{ $t('settings.custom') }}</span>
    </button>
  </div>
</template>
