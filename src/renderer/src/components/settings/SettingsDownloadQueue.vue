<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
const settings = useSettingsStore();
</script>
<template>
  <SettingsPanel :title="$t('settings.downloadQueueSection')">
    <SettingsCard>
      <SettingsSectionTitle
        :title="`${$t('settings.maxConcurrent')} ${settings.download.maxConcurrent}`"
        :description="$t('settings.maxConcurrentDesc')"
      />
      <input
        type="range"
        min="1"
        max="8"
        :value="settings.download.maxConcurrent"
        class="w-full"
        @input="
          settings.updateDownload({
            maxConcurrent: parseInt(($event.target as HTMLInputElement).value)
          })
        "
      />
      <p v-if="settings.download.maxConcurrent > 3" class="text-[11px] text-warning mt-1">
        {{ $t('settings.maxConcurrentWarning') }}
      </p>
    </SettingsCard>
    <SettingsCard>
      <SettingsSectionTitle
        :title="`${$t('settings.retryAttempts')}: ${settings.download.retryAttempts ?? 3}`"
        :description="$t('settings.retryAttemptsDesc')"
      />
      <input
        type="range"
        min="0"
        max="5"
        :value="settings.download.retryAttempts ?? 3"
        class="w-full"
        @input="
          settings.updateDownload({
            retryAttempts: parseInt(($event.target as HTMLInputElement).value)
          })
        "
      />
      <div class="flex justify-between text-[10px] text-base-content/40 mt-1">
        <span>0 (brak)</span><span>5</span>
      </div>
    </SettingsCard>
    <SettingsCard>
      <SettingsSectionTitle
        :title="$t('settings.retryBaseMs')"
        :description="$t('settings.retryBaseMsDesc')"
      />
      <select
        class="w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm"
        :value="String(settings.download.retryBaseMs ?? 1500)"
        @change="
          settings.updateDownload({
            retryBaseMs: parseInt(($event.target as HTMLSelectElement).value)
          })
        "
      >
        <option value="500">500 ms</option>
        <option value="1000">1 s</option>
        <option value="1500">1.5 s</option>
        <option value="3000">3 s</option>
        <option value="5000">5 s</option>
      </select>
    </SettingsCard>
    <SettingsCard>
      <SettingsRow :label="$t('settings.hashFiles')" :description="$t('settings.hashFilesDesc')"
        ><SettingsToggle
          :model-value="settings.download.hashFiles"
          @update:model-value="settings.updateDownload({ hashFiles: $event })"
      /></SettingsRow>
    </SettingsCard>
    <SettingsCard>
      <SettingsRow
        :label="$t('settings.autoDownloadSub')"
        :description="$t('settings.autoDownloadSubDesc')"
        ><SettingsToggle
          :model-value="settings.download.autoDownloadSubscriptions"
          @update:model-value="settings.updateDownload({ autoDownloadSubscriptions: $event })"
      /></SettingsRow>
    </SettingsCard>
    <SettingsCard>
      <SettingsRow
        :label="$t('settings.nightSchedule')"
        :description="$t('settings.nightScheduleDesc')"
        ><SettingsToggle
          :model-value="settings.download.nightScheduleEnabled"
          @update:model-value="settings.updateDownload({ nightScheduleEnabled: $event })"
      /></SettingsRow>
      <div v-if="settings.download.nightScheduleEnabled" class="mt-3 flex items-center gap-2">
        <input
          type="number"
          min="0"
          max="23"
          :value="settings.download.nightScheduleStart"
          class="px-2 py-1.5 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm w-20"
          @change="
            settings.updateDownload({
              nightScheduleStart: parseInt(($event.target as HTMLInputElement).value) || 0
            })
          "
        />
        <span class="text-xs text-base-content/50">—</span>
        <input
          type="number"
          min="0"
          max="23"
          :value="settings.download.nightScheduleEnd"
          class="px-2 py-1.5 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm w-20"
          @change="
            settings.updateDownload({
              nightScheduleEnd: parseInt(($event.target as HTMLInputElement).value) || 0
            })
          "
        />
        <span class="text-xs text-base-content/50">{{ $t('settings.nightScheduleHours') }}</span>
      </div>
    </SettingsCard>
    <SettingsCard>
      <SettingsRow
        :label="$t('settings.autoAddDownloadFolder')"
        :description="$t('settings.autoAddDownloadFolderDesc')"
        ><SettingsToggle
          :model-value="settings.download.autoAddDownloadFolder"
          @update:model-value="settings.updateDownload({ autoAddDownloadFolder: $event })"
      /></SettingsRow>
    </SettingsCard>
  </SettingsPanel>
</template>
