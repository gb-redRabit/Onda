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
  <SettingsPanel :title="$t('settings.playbackBufferSection')">
    <SettingsCard>
      <SettingsSectionTitle :title="`${$t('settings.crossfade')} ${settings.playback.crossfadeSeconds ?? 0}s`" :description="$t('settings.crossfadeDesc')" />
      <input type="range" min="0" max="12" step="1" :value="settings.playback.crossfadeSeconds ?? 0" class="w-full" @input="settings.updatePlayback({ crossfadeSeconds: parseInt(($event.target as HTMLInputElement).value) })" />
      <div class="flex justify-between text-[10px] text-base-content/40 mt-1"><span>0</span><span>12s</span></div>
    </SettingsCard>
    <SettingsCard>
      <SettingsSectionTitle :title="`${$t('settings.streamPreload')} ${settings.playback.streamPreloadSeconds ?? 5}s`" :description="$t('settings.streamPreloadDesc')" />
      <input type="range" min="0" max="30" step="1" :value="settings.playback.streamPreloadSeconds ?? 5" class="w-full" @input="settings.updatePlayback({ streamPreloadSeconds: parseInt(($event.target as HTMLInputElement).value) })" />
    </SettingsCard>
    <SettingsCard>
      <div class="divide-y divide-base-300">
        <SettingsRow :label="$t('settings.perSourceVolume')" :description="$t('settings.perSourceVolumeDesc')"><SettingsToggle :model-value="!!settings.playback.perSourceVolume" @update:model-value="settings.updatePlayback({ perSourceVolume: $event })" /></SettingsRow>
        <SettingsRow :label="$t('settings.autoResume')" :description="$t('settings.autoResumeDesc')"><SettingsToggle :model-value="settings.playback.autoResume ?? true" @update:model-value="settings.updatePlayback({ autoResume: $event })" /></SettingsRow>
      </div>
    </SettingsCard>
    <SettingsCard>
      <SettingsSectionTitle :title="(settings.playback.sleepTimerMinutes ?? 0) === 0 ? $t('settings.sleepTimer') + ': ' + $t('settings.sleepOff') : `${$t('settings.sleepTimer')}: ${settings.playback.sleepTimerMinutes}m`" :description="$t('settings.sleepTimerDesc')" />
      <input type="range" min="0" max="120" step="5" :value="settings.playback.sleepTimerMinutes ?? 0" class="w-full" @input="settings.updatePlayback({ sleepTimerMinutes: parseInt(($event.target as HTMLInputElement).value) })" />
      <div class="flex justify-between text-[10px] text-base-content/40 mt-1"><span>OFF</span><span>120m</span></div>
    </SettingsCard>
  </SettingsPanel>
</template>
