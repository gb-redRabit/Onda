<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
const settings = useSettingsStore();
function updateProxyYt(patch: Partial<typeof settings.network.proxyYoutube>) {
  settings.updateNetwork({ proxyYoutube: { ...settings.network.proxyYoutube, ...patch } });
}
function updateProxySc(patch: Partial<typeof settings.network.proxySoundcloud>) {
  settings.updateNetwork({ proxySoundcloud: { ...settings.network.proxySoundcloud, ...patch } });
}
</script>
<template>
  <SettingsPanel :title="$t('settings.networkPlatformSection')">
    <SettingsCard>
      <SettingsRow :label="$t('settings.qualityPerPlatform')" :description="$t('settings.qualityPerPlatformDesc')">
        <SettingsToggle :model-value="!!settings.network.defaultQualityPerPlatform" @update:model-value="settings.updateNetwork({ defaultQualityPerPlatform: $event })" />
      </SettingsRow>
      <template v-if="settings.network.defaultQualityPerPlatform">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <label class="block text-xs text-base-content/50">YouTube<select :value="settings.network.youtubeQuality || 'best'" class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm" @change="settings.updateNetwork({ youtubeQuality: ($event.target as HTMLSelectElement).value })"><option value="best">best</option><option value="high">high</option><option value="medium">medium</option><option value="low">low</option></select></label>
          <label class="block text-xs text-base-content/50">SoundCloud<select :value="settings.network.soundcloudQuality || 'best'" class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm" @change="settings.updateNetwork({ soundcloudQuality: ($event.target as HTMLSelectElement).value })"><option value="best">best</option><option value="high">high</option><option value="medium">medium</option><option value="low">low</option></select></label>
        </div>
      </template>
    </SettingsCard>
    <SettingsCard>
      <SettingsRow :label="$t('settings.proxyPerPlatform')" :description="$t('settings.proxyPerPlatformDesc')"><SettingsToggle :model-value="!!settings.network.proxyPerPlatform" @update:model-value="settings.updateNetwork({ proxyPerPlatform: $event })" /></SettingsRow>
      <template v-if="settings.network.proxyPerPlatform">
        <div class="mt-3 p-3 rounded-box border border-base-300 bg-base-200/30">
          <div class="text-xs font-semibold mb-2">YouTube proxy</div>
          <SettingsRow :label="$t('settings.enableProxy')"><SettingsToggle :model-value="settings.network.proxyYoutube.enabled" @update:model-value="updateProxyYt({ enabled: $event })" /></SettingsRow>
          <template v-if="settings.network.proxyYoutube.enabled"><div class="grid grid-cols-2 gap-2 mt-2"><input :value="settings.network.proxyYoutube.host" placeholder="host" class="px-2 py-1.5 rounded-field bg-base-100 border border-base-300 text-sm" @input="updateProxyYt({ host: ($event.target as HTMLInputElement).value })" /><input type="number" :value="settings.network.proxyYoutube.port" class="px-2 py-1.5 rounded-field bg-base-100 border border-base-300 text-sm" @input="updateProxyYt({ port: parseInt(($event.target as HTMLInputElement).value) || 8080 })" /></div></template>
        </div>
        <div class="mt-3 p-3 rounded-box border border-base-300 bg-base-200/30">
          <div class="text-xs font-semibold mb-2">SoundCloud proxy</div>
          <SettingsRow :label="$t('settings.enableProxy')"><SettingsToggle :model-value="settings.network.proxySoundcloud.enabled" @update:model-value="updateProxySc({ enabled: $event })" /></SettingsRow>
          <template v-if="settings.network.proxySoundcloud.enabled"><div class="grid grid-cols-2 gap-2 mt-2"><input :value="settings.network.proxySoundcloud.host" placeholder="host" class="px-2 py-1.5 rounded-field bg-base-100 border border-base-300 text-sm" @input="updateProxySc({ host: ($event.target as HTMLInputElement).value })" /><input type="number" :value="settings.network.proxySoundcloud.port" class="px-2 py-1.5 rounded-field bg-base-100 border border-base-300 text-sm" @input="updateProxySc({ port: parseInt(($event.target as HTMLInputElement).value) || 8080 })" /></div></template>
        </div>
      </template>
    </SettingsCard>
  </SettingsPanel>
</template>
