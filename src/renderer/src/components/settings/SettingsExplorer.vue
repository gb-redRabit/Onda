<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
import SettingsGroup from '@renderer/components/settings/SettingsGroup.vue';
import { readSelect } from '@renderer/utils/selectOptions';

const settings = useSettingsStore();

/** Same lists the options are rendered from, so validation and UI cannot drift. */
const EXPLORER_SORT_BY = ['name', 'size', 'type', 'modified'] as const;
const EXPLORER_SORT_ORDER = ['asc', 'desc'] as const;
</script>

<template>
  <SettingsGroup :title="$t('settings.viewMode')" :description="$t('settings.viewModeDesc')">
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
  </SettingsGroup>

  <SettingsGroup :title="$t('settings.sorting')">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-xs text-base-content/70">{{ $t('settings.sortBy') }}</span>
        <select
          :value="settings.explorer.sortBy"
          class="px-3 py-2 rounded-field bg-base-100 border border-base-300 text-sm"
          @change="settings.updateExplorer({ sortBy: readSelect($event, EXPLORER_SORT_BY) })"
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
          @change="
            settings.updateExplorer({
              sortOrder: readSelect($event, EXPLORER_SORT_ORDER)
            })
          "
        >
          <option value="asc">{{ $t('settings.sortAsc') }}</option>
          <option value="desc">{{ $t('settings.sortDesc') }}</option>
        </select>
      </label>
    </div>
  </SettingsGroup>

  <SettingsGroup>
    <SettingsRow
      :label="$t('settings.confirmBeforeMove')"
      :description="$t('settings.confirmBeforeMoveDesc')"
    >
      <SettingsToggle
        :model-value="settings.explorer.confirmBeforeMove"
        @update:model-value="settings.updateExplorer({ confirmBeforeMove: $event })"
      />
    </SettingsRow>
    <SettingsRow
      :label="$t('settings.permanentDelete')"
      :description="$t('settings.permanentDeleteDesc')"
    >
      <SettingsToggle
        :model-value="settings.explorer.permanentDelete"
        @update:model-value="settings.updateExplorer({ permanentDelete: $event })"
      />
    </SettingsRow>
  </SettingsGroup>
</template>
