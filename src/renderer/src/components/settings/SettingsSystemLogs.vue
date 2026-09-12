<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
const settings = useSettingsStore();
</script>
<template>
  <SettingsPanel :title="$t('settings.logsSection')">
    <SettingsCard>
      <SettingsRow :label="$t('settings.logLevel')" :description="$t('settings.logLevelDesc')">
        <select
          :value="settings.general.logLevel || 'info'"
          class="px-2 py-1.5 rounded-field bg-base-100 border border-base-300 text-sm"
          @change="
            settings.updateGeneral({ logLevel: ($event.target as HTMLSelectElement).value as any })
          "
        >
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
      </SettingsRow>
      <div class="mt-3">
        <div class="text-xs font-medium mb-1">
          {{ $t('settings.logMaxSize') }}: {{ settings.general.logMaxSizeMB ?? 10 }} MB
        </div>
        <input
          type="range"
          min="1"
          max="100"
          step="1"
          :value="settings.general.logMaxSizeMB ?? 10"
          class="w-full"
          @input="
            settings.updateGeneral({
              logMaxSizeMB: parseInt(($event.target as HTMLInputElement).value)
            })
          "
        />
        <div class="flex justify-between text-[10px] text-base-content/40">
          <span>1 MB</span><span>100 MB</span>
        </div>
      </div>
    </SettingsCard>
    <SettingsCard>
      <SettingsRow
        :label="$t('settings.experimental')"
        :description="$t('settings.experimentalDesc')"
        ><SettingsToggle
          :model-value="!!settings.general.experimentalEnabled"
          @update:model-value="settings.updateGeneral({ experimentalEnabled: $event })"
      /></SettingsRow>
      <p class="text-[11px] text-base-content/40 mt-2">{{ $t('settings.telemetryOff') }}</p>
    </SettingsCard>
  </SettingsPanel>
</template>
