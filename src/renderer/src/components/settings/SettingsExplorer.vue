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
  <SettingsPanel :title="$t('settings.explorer')">
    <SettingsCard>
      <SettingsSectionTitle
        :title="$t('settings.viewMode')"
        :description="$t('settings.viewModeDesc')"
      />
      <div class="flex flex-wrap gap-2">
        <button
          v-for="mode in ['extraSmall', 'small', 'medium', 'large', 'extraLarge', 'details'] as const"
          :key="mode"
          class="px-3 py-1.5 rounded-field text-xs font-medium border transition-colors"
          :class="
            settings.explorer.viewMode === mode
              ? 'bg-primary text-primary-content border-primary'
              : 'bg-base-100 border-base-300 hover:bg-base-200'
          "
          @click="settings.updateExplorer({ viewMode: mode })"
        >
          {{ $t('settings.viewMode_' + mode) }}
        </button>
      </div>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.sorting')" />
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-xs text-base-content/70">{{ $t('settings.sortBy') }}</span>
          <select
            :value="settings.explorer.sortBy"
            class="px-3 py-2 rounded-field bg-base-100 border border-base-300 text-sm"
            @change="settings.updateExplorer({ sortBy: ($event.target as HTMLSelectElement).value as any })"
          >
            <option value="name">{{ $t('settings.sortByName') }}</option>
            <option value="size">{{ $t('settings.sortBySize') }}</option>
            <option value="type">{{ $t('settings.sortByType') }}</option>
            <option value="modified">{{ $t('settings.sortByModified') }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-base-content/70">{{ $t('settings.sortOrder') }}</span>
          <select
            :value="settings.explorer.sortOrder"
            class="px-3 py-2 rounded-field bg-base-100 border border-base-300 text-sm"
            @change="settings.updateExplorer({ sortOrder: ($event.target as HTMLSelectElement).value as any })"
          >
            <option value="asc">{{ $t('settings.sortAsc') }}</option>
            <option value="desc">{{ $t('settings.sortDesc') }}</option>
          </select>
        </label>
      </div>
    </SettingsCard>

    <SettingsCard>
      <SettingsRow :label="$t('settings.confirmBeforeMove')" :description="$t('settings.confirmBeforeMoveDesc')">
        <SettingsToggle
          :model-value="settings.explorer.confirmBeforeMove"
          @update:model-value="settings.updateExplorer({ confirmBeforeMove: $event })"
        />
      </SettingsRow>
    </SettingsCard>
  </SettingsPanel>
</template>
