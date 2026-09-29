<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { AppInfo } from '@shared/types/ipc';
import { logger } from '@shared/logger';
import SettingsGroup from '@renderer/components/settings/SettingsGroup.vue';

const info = ref<AppInfo | null>(null);
const licenses = ref<Array<{ name: string; version?: string; license?: string }>>([]);

const links = [{ label: 'GitHub', url: 'https://github.com/gb-redRabit/Onda' }];

onMounted(async () => {
  try {
    const [i, l] = await Promise.all([window.api?.getAppInfo(), window.api?.getLicenses()]);
    if (i) info.value = i;
    if (l) licenses.value = l;
  } catch (e) {
    logger.warn('about', 'load failed', e);
  }
});
</script>

<template>
  <SettingsGroup>
    <div class="flex items-center gap-4">
      <div
        class="w-16 h-16 rounded-box bg-primary/10 flex items-center justify-center text-primary text-2xl font-black"
      >
        O
      </div>
      <div>
        <h2 class="text-xl font-bold">{{ info?.appName || 'Onda' }}</h2>
        <div class="text-sm text-base-content/50 mt-0.5">v{{ info?.appVersion }}</div>
      </div>
    </div>
  </SettingsGroup>

  <SettingsGroup :title="$t('settings.licenses')">
    <div class="divide-y divide-base-300">
      <div
        v-for="lic in licenses"
        :key="lic.name"
        class="flex items-center justify-between py-2 text-xs"
      >
        <span class="font-mono">{{ lic.name }}@{{ lic.version }}</span>
        <span class="text-base-content/50">{{ lic.license || $t('settings.licenseUnknown') }}</span>
      </div>
      <div v-if="!licenses.length" class="py-2 text-xs text-base-content/50">
        {{ $t('settings.licenseUnknown') }}
      </div>
    </div>
  </SettingsGroup>

  <div class="flex gap-3">
    <a
      v-for="link in links"
      :key="link.url"
      :href="link.url"
      target="_blank"
      rel="noopener"
      class="px-3 py-1.5 rounded-field bg-base-100 border border-base-300 text-xs font-medium hover:bg-base-content/10 transition-colors"
    >
      {{ link.label }}
    </a>
  </div>
</template>
