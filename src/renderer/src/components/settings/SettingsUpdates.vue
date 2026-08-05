<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { useI18n } from 'vue-i18n';
import type { UpdaterState } from '@shared/types/ipc';
import { logger } from '@shared/logger';
import { Download, RefreshCw, RotateCw } from '@lucide/vue';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';

const settings = useSettingsStore();
const { t } = useI18n();

const state = ref<UpdaterState>({
  status: 'idle',
  current: '',
  version: '',
  progress: 0,
  error: '',
  enabled: true
});

let cleanup: (() => void) | null = null;

onMounted(async () => {
  cleanup = window.api?.on('updater:event', (payload) => {
    const p = payload as { event: string; version?: string; percent?: number; error?: string };
    switch (p.event) {
      case 'checking-for-update':
        state.value.status = 'checking';
        break;
      case 'update-available':
        state.value.status = 'available';
        state.value.version = p.version ?? '';
        state.value.error = '';
        break;
      case 'update-not-available':
        state.value.status = 'not-available';
        break;
      case 'download-progress':
        state.value.status = 'downloading';
        state.value.progress = p.percent ?? 0;
        break;
      case 'update-downloaded':
        state.value.status = 'downloaded';
        state.value.progress = 100;
        break;
      case 'error':
        state.value.status = 'error';
        state.value.error = p.error ?? t('settings.updateError');
        break;
    }
  });
  try {
    const s = await window.api?.getUpdaterState();
    if (s) state.value = { ...state.value, ...s };
  } catch (e) {
    logger.warn('updates', 'getUpdaterState failed', e);
  }
});

onUnmounted(() => cleanup?.());

async function onCheck(): Promise<void> {
  state.value.status = 'checking';
  state.value.error = '';
  try {
    const r = await window.api?.checkForUpdates();
    if (r && !r.checking) state.value.status = 'idle';
  } catch (e) {
    logger.warn('updates', 'check failed', e);
    state.value.status = 'error';
  }
}

async function onDownload(): Promise<void> {
  state.value.status = 'downloading';
  state.value.progress = 0;
  await window.api?.downloadUpdate();
}

function onInstall(): void {
  window.api?.installUpdate();
}
</script>

<template>
  <SettingsPanel :title="$t('settings.updateSection')">
    <SettingsCard v-if="!state.enabled" class="!p-4">
      <div class="text-sm font-medium">{{ $t('settings.updateDevOnly') }}</div>
      <div class="text-xs text-fg-faint mt-1">{{ $t('settings.updateDevOnlyDesc') }}</div>
    </SettingsCard>

    <SettingsCard>
      <SettingsRow :label="$t('settings.autoCheck')" :description="$t('settings.autoCheckDesc')">
        <SettingsToggle
          :model-value="settings.updates.autoCheck"
          @update:model-value="settings.updateUpdates({ autoCheck: $event })"
        />
      </SettingsRow>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.checkInterval')" />
      <select
        class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none focus:ring-2 focus:ring-accent-base/15 transition-all"
        :value="settings.updates.checkInterval"
        @change="
          settings.updateUpdates({
            checkInterval: ($event.target as HTMLSelectElement).value as any
          })
        "
      >
        <option value="startup">{{ $t('settings.onStartup') }}</option>
        <option value="hourly">{{ $t('settings.hourly') }}</option>
        <option value="daily">{{ $t('settings.daily') }}</option>
        <option value="weekly">{{ $t('settings.weekly') }}</option>
      </select>
    </SettingsCard>

    <SettingsCard>
      <div class="flex items-center justify-between">
        <SettingsSectionTitle :title="$t('settings.currentVersion')" />
        <span class="text-sm font-mono text-fg-faint">v{{ state.current }}</span>
      </div>

      <div v-if="state.status === 'available'" class="flex items-center justify-between py-1">
        <div class="text-sm text-accent-base">
          {{ $t('settings.updateAvailable') }} v{{ state.version }}
        </div>
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-base text-white text-xs font-medium hover:bg-accent-hover transition-colors"
          @click="onDownload"
        >
          <Download :size="14" />{{ $t('settings.downloadUpdate') }}
        </button>
      </div>

      <div v-else-if="state.status === 'downloading'" class="my-2">
        <div class="flex justify-between text-xs text-fg-faint mb-1">
          <span>{{ $t('settings.downloading') }}</span>
          <span class="font-mono">{{ Math.round(state.progress) }}%</span>
        </div>
        <div class="h-1.5 rounded-full bg-bg-base overflow-hidden">
          <div
            class="h-full bg-accent-base transition-[width] duration-200"
            :style="{ width: state.progress + '%' }"
          />
        </div>
      </div>

      <div v-else-if="state.status === 'downloaded'" class="flex items-center justify-between py-1">
        <div class="text-sm text-green-500">
          {{ $t('settings.updateReady') }} v{{ state.version }}
        </div>
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-base text-white text-xs font-medium hover:bg-accent-hover transition-colors"
          @click="onInstall"
        >
          <RotateCw :size="14" />{{ $t('settings.restartInstall') }}
        </button>
      </div>

      <div v-else-if="state.status === 'not-available'" class="text-sm text-green-500 py-1">
        {{ $t('settings.updateUpToDate') }}
      </div>

      <div v-else-if="state.status === 'checking'" class="text-sm text-fg-faint py-1">
        {{ $t('settings.checking') }}…
      </div>

      <div v-else-if="state.status === 'error'" class="text-xs text-red-500 py-1 break-words">
        {{ state.error }}
      </div>

      <button
        class="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
        :disabled="!state.enabled || state.status === 'checking' || state.status === 'downloading'"
        @click="onCheck"
      >
        <RefreshCw :size="15" />{{ $t('settings.checkNow') }}
      </button>
    </SettingsCard>
  </SettingsPanel>
</template>
