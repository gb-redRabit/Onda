<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { CheckCircle2 } from '@lucide/vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { useLibraryStore } from '@renderer/stores/library';
import { useYoutubeAuth } from '@renderer/composables/useYoutubeAuth';

defineProps<{ scanNow: boolean }>();

const settings = useSettingsStore();
const library = useLibraryStore();
const { status, ensureLoaded } = useYoutubeAuth();

onMounted(() => {
  void ensureLoaded();
});

const rows = computed(() => [
  {
    labelKey: 'wizard.summaryLibrary',
    value: library.folders.length > 0 ? library.folders.join(' · ') : ''
  },
  {
    labelKey: 'wizard.summaryDownload',
    value: settings.download.defaultPath || ''
  },
  {
    labelKey: 'wizard.summaryTheme',
    value: ''
  },
  {
    labelKey: 'wizard.summaryScan',
    value: ''
  },
  {
    labelKey: 'wizard.summaryOnline',
    value: ''
  }
]);
</script>

<template>
  <div>
    <span
      class="w-12 h-12 rounded-box bg-primary/15 text-primary flex items-center justify-center mb-4"
    >
      <CheckCircle2 :size="24" />
    </span>
    <h3 class="text-lg font-bold tracking-tight mb-1.5">{{ $t('wizard.summaryTitle') }}</h3>
    <p class="text-sm text-base-content/70 mb-5">{{ $t('wizard.summaryDesc') }}</p>

    <div
      class="rounded-box border border-base-300 bg-base-200/[var(--glass-alpha)] overflow-hidden"
    >
      <div
        v-for="(row, i) in rows"
        :key="row.labelKey"
        class="flex items-start justify-between gap-6 px-4 py-3"
        :class="i > 0 ? 'border-t border-base-300' : ''"
      >
        <span class="text-sm text-base-content/60 shrink-0">{{ $t(row.labelKey) }}</span>
        <span class="text-sm font-medium text-right min-w-0 truncate">
          <template v-if="row.labelKey === 'wizard.summaryLibrary'">
            {{ row.value || $t('wizard.noneSelected') }}
          </template>
          <template v-else-if="row.labelKey === 'wizard.summaryDownload'">
            {{ row.value || $t('wizard.noneSelected') }}
          </template>
          <template v-else-if="row.labelKey === 'wizard.summaryTheme'">
            {{
              settings.appearance.theme === 'custom'
                ? $t('settings.custom')
                : $t(`settings.${settings.appearance.theme}`)
            }}
          </template>
          <template v-else-if="row.labelKey === 'wizard.summaryScan'">
            {{
              scanNow && library.folders.length > 0
                ? $t('wizard.summaryScanOn')
                : $t('wizard.summaryScanOff')
            }}
          </template>
          <template v-else-if="row.labelKey === 'wizard.summaryOnline'">
            {{
              status.loggedIn ? $t('wizard.summaryOnlineSigned') : $t('wizard.summaryOnlineSkipped')
            }}
          </template>
        </span>
      </div>
    </div>
  </div>
</template>
