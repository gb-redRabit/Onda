<script setup lang="ts">
import { onMounted } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';

const settings = useSettingsStore();

onMounted(async () => {
  try {
    const s = await window.api?.getAutoLaunch();
    if (s) settings.updateGeneral({ autoLaunch: s.enabled });
  } catch {
    /* auto-launch status unavailable */
  }
});

async function setAutoLaunch(enabled: boolean): Promise<void> {
  settings.updateGeneral({ autoLaunch: enabled });
  await window.api?.setAutoLaunch({ enabled, hidden: settings.general.startMinimized });
}

function setStartMinimized(value: boolean): void {
  settings.updateGeneral({ startMinimized: value });
  if (settings.general.autoLaunch) {
    void window.api?.setAutoLaunch({ enabled: true, hidden: value });
  }
}

function setCloseToTray(value: boolean): void {
  settings.updateGeneral({ closeToTray: value });
}
</script>

<template>
  <SettingsPanel :title="$t('settings.generalSection')">
    <SettingsCard>
      <SettingsRow :label="$t('settings.autoLaunch')" :description="$t('settings.autoLaunchDesc')">
        <SettingsToggle
          :model-value="settings.general.autoLaunch"
          @update:model-value="setAutoLaunch"
        />
      </SettingsRow>
      <SettingsRow
        :label="$t('settings.startMinimized')"
        :description="$t('settings.startMinimizedDesc')"
      >
        <SettingsToggle
          :model-value="settings.general.startMinimized"
          @update:model-value="setStartMinimized"
        />
      </SettingsRow>
      <SettingsRow
        :label="$t('settings.closeToTray')"
        :description="$t('settings.closeToTrayDesc')"
      >
        <SettingsToggle
          :model-value="settings.general.closeToTray"
          @update:model-value="setCloseToTray"
        />
      </SettingsRow>
      <SettingsRow
        :label="$t('settings.restoreSession')"
        :description="$t('settings.restoreSessionDesc')"
      >
        <SettingsToggle
          :model-value="settings.general.restoreSession"
          @update:model-value="settings.updateGeneral({ restoreSession: $event })"
        />
      </SettingsRow>
    </SettingsCard>
  </SettingsPanel>
</template>
