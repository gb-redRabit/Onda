<script setup lang="ts">
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
</script>

<template>
  <SettingsPanel :title="$t('settings.apiKeysSection')">
    <SettingsCard>
      <div>
        <label class="text-xs text-fg-faint mb-1 block">{{ $t('settings.youtubeApiKey') }}</label>
        <input
          type="password"
          :placeholder="$t('settings.youtubeApiPlaceholder')"
          class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none focus:ring-2 focus:ring-accent-base/15 transition-all placeholder:text-fg-faint"
        />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="text-xs text-fg-faint mb-1 block">{{ $t('settings.maxResults') }}</label>
          <input
            type="number"
            min="1"
            max="50"
            value="25"
            class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none focus:ring-2 focus:ring-accent-base/15 transition-all"
          />
        </div>
        <div>
          <label class="text-xs text-fg-faint mb-1 block">{{ $t('settings.regionCode') }}</label>
          <input
            type="text"
            value="US"
            maxlength="2"
            class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none focus:ring-2 focus:ring-accent-base/15 transition-all"
          />
        </div>
      </div>
      <button
        class="px-4 py-2 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover transition-colors"
      >
        {{ $t('settings.saveApiKey') }}
      </button>
    </SettingsCard>
  </SettingsPanel>
</template>
