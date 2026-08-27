<script setup lang="ts">
import { onMounted } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
import { useUIStore } from '@renderer/stores/ui';
import { Wand2 } from '@lucide/vue';

const settings = useSettingsStore();
const ui = useUIStore();

onMounted(async () => {
  try {
    const s = await window.api?.getAutoLaunch();
    if (s) settings.updateGeneral({ autoLaunch: s.enabled, startMinimized: s.hidden });
  } catch {
    /* auto-launch status unavailable */
  }
});

async function setAutoLaunch(enabled: boolean): Promise<void> {
  settings.updateGeneral({ autoLaunch: enabled });
  settings.saveImmediate();
  await window.api?.setAutoLaunch({ enabled, hidden: settings.general.startMinimized });
}

function setStartMinimized(value: boolean): void {
  settings.updateGeneral({ startMinimized: value });
  settings.saveImmediate();
  if (settings.general.autoLaunch) {
    void window.api?.setAutoLaunch({ enabled: true, hidden: value });
  }
}

async function setCloseToTray(value: boolean): Promise<void> {
  settings.updateGeneral({ closeToTray: value });
  settings.saveImmediate();
  try {
    await window.api?.invoke('app:setCloseToTray', value);
  } catch {
    /* main sync failed — debounced persist will sync */
  }
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
          :disabled="!settings.general.autoLaunch"
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
      <div class="flex items-center justify-between gap-4 pt-2 border-t border-base-300">
        <div class="min-w-0">
          <div class="text-sm font-medium">{{ $t('settings.showSetupWizard') }}</div>
          <p class="text-xs text-base-content/50 mt-0.5">
            {{ $t('settings.showSetupWizardDesc') }}
          </p>
        </div>
        <button
          class="fx-noise px-3.5 py-2 fx-depth rounded-field text-sm font-medium flex items-center gap-1.5 shrink-0 transition-colors border border-primary/40 text-primary hover:bg-primary/10"
          @click="ui.openSetupWizard()"
        >
          <Wand2 :size="15" />
          {{ $t('settings.showSetupWizard') }}
        </button>
      </div>
    </SettingsCard>
  </SettingsPanel>
</template>
