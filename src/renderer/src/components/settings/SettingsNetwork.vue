<script setup lang="ts">
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
import { ref } from 'vue';

const proxyEnabled = ref(false);
</script>

<template>
  <SettingsPanel :title="$t('settings.networkSection')">
    <SettingsCard>
      <SettingsRow :label="$t('settings.enableProxy')">
        <SettingsToggle v-model="proxyEnabled" />
      </SettingsRow>
      <div v-if="proxyEnabled" class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        <input
          placeholder="Host"
          class="px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none focus:ring-2 focus:ring-accent-base/15 transition-all placeholder:text-fg-faint"
        />
        <input
          placeholder="Port"
          type="number"
          class="px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none focus:ring-2 focus:ring-accent-base/15 transition-all placeholder:text-fg-faint"
        />
        <select
          class="px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none focus:ring-2 focus:ring-accent-base/15 transition-all"
        >
          <option>HTTP</option>
          <option>HTTPS</option>
          <option>SOCKS5</option>
        </select>
      </div>
    </SettingsCard>
  </SettingsPanel>
</template>
