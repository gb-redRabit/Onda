<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';

const settings = useSettingsStore();

function updateProxy(patch: Partial<typeof settings.network.proxy>) {
  settings.updateNetwork({ proxy: { ...settings.network.proxy, ...patch } });
}
</script>

<template>
  <SettingsPanel :title="$t('settings.networkSection')">
    <SettingsCard>
      <SettingsRow :label="$t('settings.enableProxy')" :description="$t('settings.proxyHint')">
        <SettingsToggle
          :model-value="settings.network.proxy.enabled"
          @update:model-value="updateProxy({ enabled: $event })"
        />
      </SettingsRow>

      <template v-if="settings.network.proxy.enabled">
        <SettingsSectionTitle :title="$t('settings.proxyType')" />
        <div class="flex gap-1 bg-base-200/[var(--glass-alpha)] rounded-box p-1 w-fit">
          <button
            v-for="type in ['http', 'https', 'socks5'] as const"
            :key="type"
            class="fx-noise px-3 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors uppercase"
            :class="
              settings.network.proxy.type === type
                ? 'bg-primary text-primary-content'
                : 'text-base-content/70 hover:text-base-content'
            "
            @click="updateProxy({ type })"
          >
            {{ type }}
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <SettingsSectionTitle :title="$t('settings.proxyHost')" />
            <input
              :value="settings.network.proxy.host"
              class="w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
              @input="updateProxy({ host: ($event.target as HTMLInputElement).value })"
            />
          </div>
          <div>
            <SettingsSectionTitle :title="$t('settings.proxyPort')" />
            <input
              type="number"
              :value="settings.network.proxy.port"
              class="w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
              @input="
                updateProxy({ port: parseInt(($event.target as HTMLInputElement).value) || 0 })
              "
            />
          </div>
          <div>
            <SettingsSectionTitle :title="$t('settings.proxyUsername')" />
            <input
              :value="settings.network.proxy.username"
              class="w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
              @input="updateProxy({ username: ($event.target as HTMLInputElement).value })"
            />
          </div>
          <div>
            <SettingsSectionTitle :title="$t('settings.proxyPassword')" />
            <input
              type="password"
              :value="settings.network.proxy.password"
              class="w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
              @input="updateProxy({ password: ($event.target as HTMLInputElement).value })"
            />
          </div>
        </div>
      </template>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle
        :title="
          settings.network.downloadSpeedLimit === 0
            ? `${$t('settings.downloadSpeedLimit')}: ${$t('settings.speedUnlimited')}`
            : `${$t('settings.downloadSpeedLimit')}: ${(settings.network.downloadSpeedLimit / 1024).toFixed(1)} MB/s`
        "
        :description="$t('settings.speedLimitDesc')"
      />
      <input
        type="range"
        min="0"
        max="51200"
        step="1024"
        :value="settings.network.downloadSpeedLimit"
        class="w-full"
        @input="
          settings.updateNetwork({
            downloadSpeedLimit: parseInt(($event.target as HTMLInputElement).value)
          })
        "
      />
      <div class="flex justify-between text-[10px] text-base-content/40 mt-1">
        <span>{{ $t('settings.speedUnlimited') }}</span
        ><span>50 MB/s</span>
      </div>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle
        :title="$t('settings.userAgent')"
        :description="$t('settings.userAgentDesc')"
      />
      <input
        :value="settings.network.userAgent"
        placeholder="Mozilla/5.0 ..."
        class="w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
        @input="settings.updateNetwork({ userAgent: ($event.target as HTMLInputElement).value })"
      />
    </SettingsCard>
  </SettingsPanel>
</template>
