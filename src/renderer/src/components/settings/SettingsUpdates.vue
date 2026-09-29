<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { useI18n } from 'vue-i18n';
import type { IpcUpdaterEvent, UpdaterState } from '@shared/types/ipc';
import { logger } from '@shared/logger';
import { Download, RefreshCw, RotateCw } from '@lucide/vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
import SettingsGroup from '@renderer/components/settings/SettingsGroup.vue';

const settings = useSettingsStore();
const { t } = useI18n();

// Segmented buttons instead of a dropdown: four short options are faster to scan
// and pick, and match the other choice rows in Settings.
const intervalOptions = [
  { id: 'startup' as const, labelKey: 'settings.onStartup' },
  { id: 'hourly' as const, labelKey: 'settings.hourly' },
  { id: 'daily' as const, labelKey: 'settings.daily' },
  { id: 'weekly' as const, labelKey: 'settings.weekly' }
];

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
    const p = payload as IpcUpdaterEvent;
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
  <SettingsGroup v-if="!state.enabled">
    <div class="text-sm font-medium">{{ $t('settings.updateDevOnly') }}</div>
    <div class="text-xs text-base-content/50 mt-1">{{ $t('settings.updateDevOnlyDesc') }}</div>
  </SettingsGroup>

  <SettingsGroup>
    <SettingsRow
      :label="$t('settings.autoCheck')"
      :description="$t('settings.autoCheckDesc')"
      path="updates.autoCheck"
      anchor="setting-auto-check"
    >
      <SettingsToggle
        :model-value="settings.updates.autoCheck"
        @update:model-value="settings.updateUpdates({ autoCheck: $event })"
      />
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup>
    <SettingsRow
      :label="$t('settings.checkInterval')"
      path="updates.checkInterval"
      anchor="setting-check-interval"
    >
      <div class="flex flex-wrap gap-1 bg-base-200/(--glass-alpha) rounded-field p-1">
        <button
          v-for="option in intervalOptions"
          :key="option.id"
          class="fx-noise px-3 py-1.5 rounded-field text-xs font-medium transition-colors whitespace-nowrap"
          :class="
            settings.updates.checkInterval === option.id
              ? 'bg-primary text-primary-content fx-depth'
              : 'text-base-content/70 hover:text-base-content hover:bg-base-content/10'
          "
          @click="settings.updateUpdates({ checkInterval: option.id })"
        >
          {{ $t(option.labelKey) }}
        </button>
      </div>
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup>
    <div class="flex items-center justify-between">
      <SettingsSectionTitle :title="$t('settings.currentVersion')" />
      <span class="text-sm font-mono text-base-content/50">v{{ state.current }}</span>
    </div>

    <div v-if="state.status === 'available'" class="flex items-center justify-between py-1">
      <div class="text-sm text-primary">
        {{ $t('settings.updateAvailable') }} v{{ state.version }}
      </div>
      <button
        class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field bg-primary text-primary-content text-xs font-medium hover:bg-primary/90 transition-colors"
        @click="onDownload"
      >
        <Download :size="14" />{{ $t('settings.downloadUpdate') }}
      </button>
    </div>

    <div v-else-if="state.status === 'downloading'" class="my-2">
      <div class="flex justify-between text-xs text-base-content/50 mb-1">
        <span>{{ $t('settings.downloading') }}</span>
        <span class="font-mono">{{ Math.round(state.progress) }}%</span>
      </div>
      <div class="h-1.5 rounded-full bg-base-200/(--glass-alpha) overflow-hidden">
        <div
          class="h-full bg-primary transition-[width] duration-200"
          :style="{ width: state.progress + '%' }"
        />
      </div>
    </div>

    <div v-else-if="state.status === 'downloaded'" class="flex items-center justify-between py-1">
      <div class="text-sm text-success">{{ $t('settings.updateReady') }} v{{ state.version }}</div>
      <button
        class="fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field bg-primary text-primary-content text-xs font-medium hover:bg-primary/90 transition-colors"
        @click="onInstall"
      >
        <RotateCw :size="14" />{{ $t('settings.restartInstall') }}
      </button>
    </div>

    <div v-else-if="state.status === 'not-available'" class="text-sm text-success py-1">
      {{ $t('settings.updateUpToDate') }}
    </div>

    <div v-else-if="state.status === 'checking'" class="text-sm text-base-content/50 py-1">
      {{ $t('settings.checking') }}…
    </div>

    <div v-else-if="state.status === 'error'" class="text-xs text-error py-1 wrap-break-word">
      {{ state.error }}
    </div>

    <button
      class="fx-noise mt-4 flex items-center gap-1.5 px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
      :disabled="!state.enabled || state.status === 'checking' || state.status === 'downloading'"
      @click="onCheck"
    >
      <RefreshCw :size="15" />{{ $t('settings.checkNow') }}
    </button>
  </SettingsGroup>
</template>
