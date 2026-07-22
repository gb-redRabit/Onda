<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import { useI18n } from 'vue-i18n';

const settings = useSettingsStore();
const { locale } = useI18n();

const languages = [
  { id: 'pl', label: 'Polski', native: 'Polski' },
  { id: 'en', label: 'English', native: 'English' }
];

function setLocale(loc: string) {
  if (loc !== 'pl' && loc !== 'en') return;
  locale.value = loc;
  settings.updateAppearance({ locale: loc });
}
</script>

<template>
  <div class="space-y-6 max-w-2xl">
    <h2 class="text-lg font-bold">{{ $t('settings.language') }}</h2>
    <div class="flex gap-3">
      <button
        v-for="lang in languages"
        :key="lang.id"
        class="flex-1 p-4 rounded-xl border-2 transition-all text-center"
        :class="
          settings.appearance.locale === lang.id
            ? 'border-accent-base shadow-lg shadow-accent-base/20'
            : 'border-border-default hover:border-border-subtle'
        "
        @click="setLocale(lang.id)"
      >
        <span class="text-2xl block mb-1">{{ lang.id === 'pl' ? '🇵🇱' : '🇬🇧' }}</span>
        <span class="text-sm font-medium">{{ lang.native }}</span>
        <span class="text-xs text-fg-muted block mt-0.5">{{ lang.label }}</span>
      </button>
    </div>
  </div>
</template>
