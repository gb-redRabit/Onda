<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import { BUILTIN_THEMES, BUILTIN_THEME_NAMES } from '@shared/builtin-themes';

const settings = useSettingsStore();
</script>

<template>
  <div>
    <h3 class="text-lg font-bold tracking-tight mb-1.5">{{ $t('wizard.appearanceTitle') }}</h3>
    <p class="text-sm text-base-content/70">{{ $t('wizard.appearanceDesc') }}</p>

    <div class="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      <button
        v-for="name in BUILTIN_THEME_NAMES"
        :key="name"
        class="p-2.5 fx-depth rounded-box border transition-all flex flex-col items-start gap-2 hover:shadow-md"
        :class="
          settings.appearance.theme === name
            ? 'border-primary bg-primary/5'
            : 'border-base-300 hover:border-primary/40'
        "
        @click="settings.updateAppearance({ theme: name })"
      >
        <span
          class="w-full h-7 rounded-field flex items-center justify-center gap-1.5 px-2"
          :style="{ backgroundColor: BUILTIN_THEMES[name].colors.base200 }"
        >
          <span
            class="w-6 h-3 rounded-field"
            :style="{ backgroundColor: BUILTIN_THEMES[name].colors.base100 }"
          />
          <span
            class="w-3 h-3 rounded-full shrink-0"
            :style="{ backgroundColor: BUILTIN_THEMES[name].colors.primary }"
          />
        </span>
        <span
          class="text-xs font-medium whitespace-nowrap"
          :class="settings.appearance.theme === name ? 'text-primary' : 'text-base-content/80'"
        >
          {{ $t(`settings.${name}`) }}
        </span>
      </button>
    </div>

    <p class="mt-4 text-xs text-base-content/50 leading-relaxed">
      {{ $t('wizard.appearanceHint') }}
    </p>
  </div>
</template>
