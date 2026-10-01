<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { PanelLeftOpen, PanelRightOpen } from '@lucide/vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsPositionGrid from '@renderer/components/settings/SettingsPositionGrid.vue';
import SettingsGroup from '@renderer/components/settings/SettingsGroup.vue';

const settings = useSettingsStore();
const { t } = useI18n();

const sidebarPositionOptions = computed(() =>
  (['left', 'right'] as const).map((pos) => ({
    id: pos,
    label: t(`settings.${pos}`),
    icon: pos === 'left' ? PanelLeftOpen : PanelRightOpen
  }))
);
</script>

<template>
  <SettingsGroup>
    <SettingsRow
      :label="$t('settings.fontSize')"
      :description="`${settings.appearance.fontSize}px`"
      path="appearance.fontSize"
      anchor="setting-font-size"
      wide
    >
      <input
        type="range"
        min="12"
        max="18"
        :value="settings.appearance.fontSize"
        class="w-full"
        @input="
          settings.updateAppearance({
            fontSize: parseInt(($event.target as HTMLInputElement).value)
          })
        "
      />
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup :title="$t('settings.sidebarPosition')">
    <SettingsPositionGrid
      :model-value="settings.appearance.sidebarPosition"
      :options="sidebarPositionOptions"
      :selected-label="t(`settings.${settings.appearance.sidebarPosition}`)"
      @update:model-value="
        settings.updateAppearance({ sidebarPosition: $event as 'left' | 'right' })
      "
    />
  </SettingsGroup>

  <SettingsGroup :title="$t('settings.sidebarSections')">
    <div class="divide-y divide-base-300">
      <SettingsRow :label="$t('library.playlists')">
        <input
          type="checkbox"
          :checked="settings.appearance.showPlaylists"
          @change="
            settings.updateAppearance({
              showPlaylists: ($event.target as HTMLInputElement).checked
            })
          "
        />
      </SettingsRow>
      <SettingsRow :label="$t('library.albums')">
        <input
          type="checkbox"
          :checked="settings.appearance.showAlbums"
          @change="
            settings.updateAppearance({ showAlbums: ($event.target as HTMLInputElement).checked })
          "
        />
      </SettingsRow>
      <SettingsRow :label="$t('settings.sidebarCollapsed')">
        <input
          type="checkbox"
          :checked="settings.appearance.sidebarCollapsed"
          @change="
            settings.updateAppearance({
              sidebarCollapsed: ($event.target as HTMLInputElement).checked
            })
          "
        />
      </SettingsRow>
      <SettingsRow
        :label="$t('settings.animations')"
        :description="$t('settings.animationsDesc')"
        path="appearance.animations"
        anchor="setting-animations"
      >
        <input
          type="checkbox"
          :checked="settings.appearance.animations"
          class="w-4 h-4 rounded accent-accent-base"
          @change="
            settings.updateAppearance({
              animations: ($event.target as HTMLInputElement).checked
            })
          "
        />
      </SettingsRow>
    </div>
  </SettingsGroup>
</template>
