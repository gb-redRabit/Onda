<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { AppInfo } from '@shared/types/ipc';
import { logger } from '@shared/logger';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';

const info = ref<AppInfo | null>(null);
const licenses = ref<Array<{ name: string; version?: string; license?: string }>>([]);

const links = [
  { label: 'Homepage', url: 'https://electron-vite.org' },
  { label: 'GitHub', url: 'https://github.com' }
];

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
  <SettingsPanel>
    <SettingsCard>
      <div class="flex items-center gap-4">
        <div
          class="w-16 h-16 rounded-2xl bg-accent-ghost flex items-center justify-center text-accent-base text-2xl font-black"
        >
          O
        </div>
        <div>
          <h2 class="text-xl font-bold">{{ info?.appName || 'Onda' }}</h2>
          <div class="text-sm text-fg-faint mt-0.5">v{{ info?.appVersion }}</div>
        </div>
      </div>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.envVersions')" />
      <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div class="p-3 rounded-xl bg-bg-base border border-border-default">
          <div class="text-[11px] text-fg-faint mb-0.5">Electron</div>
          <div class="text-sm font-mono">{{ info?.electron }}</div>
        </div>
        <div class="p-3 rounded-xl bg-bg-base border border-border-default">
          <div class="text-[11px] text-fg-faint mb-0.5">Chrome</div>
          <div class="text-sm font-mono">{{ info?.chrome }}</div>
        </div>
        <div class="p-3 rounded-xl bg-bg-base border border-border-default">
          <div class="text-[11px] text-fg-faint mb-0.5">Node.js</div>
          <div class="text-sm font-mono">{{ info?.node }}</div>
        </div>
        <div class="p-3 rounded-xl bg-bg-base border border-border-default">
          <div class="text-[11px] text-fg-faint mb-0.5">V8</div>
          <div class="text-sm font-mono">{{ info?.v8 }}</div>
        </div>
        <div class="p-3 rounded-xl bg-bg-base border border-border-default">
          <div class="text-[11px] text-fg-faint mb-0.5">{{ $t('settings.os') }}</div>
          <div class="text-sm font-mono truncate">{{ info?.os }}</div>
        </div>
        <div class="p-3 rounded-xl bg-bg-base border border-border-default">
          <div class="text-[11px] text-fg-faint mb-0.5">{{ $t('settings.platform') }}</div>
          <div class="text-sm font-mono">{{ info?.platform }} / {{ info?.arch }}</div>
        </div>
      </div>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.licenses')" />
      <div class="divide-y divide-border-default">
        <div
          v-for="lic in licenses"
          :key="lic.name"
          class="flex items-center justify-between py-2 text-xs"
        >
          <span class="font-mono">{{ lic.name }}@{{ lic.version }}</span>
          <span class="text-fg-faint">{{ lic.license || $t('settings.licenseUnknown') }}</span>
        </div>
        <div v-if="!licenses.length" class="py-2 text-xs text-fg-faint">
          {{ $t('settings.licenseUnknown') }}
        </div>
      </div>
    </SettingsCard>

    <div class="flex gap-3">
      <a
        v-for="link in links"
        :key="link.url"
        :href="link.url"
        target="_blank"
        rel="noopener"
        class="px-3 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs font-medium hover:bg-bg-hover transition-colors"
      >
        {{ link.label }}
      </a>
    </div>
  </SettingsPanel>
</template>
