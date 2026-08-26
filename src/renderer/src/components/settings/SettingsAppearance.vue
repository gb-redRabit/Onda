<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { loadLocaleMessages } from '@renderer/i18n';
import { RotateCcw, PanelLeftOpen, PanelRightOpen } from '@lucide/vue';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsPositionGrid from '@renderer/components/settings/SettingsPositionGrid.vue';

const settings = useSettingsStore();
const { t } = useI18n();

const sidebarPositionOptions = computed(() =>
  (['left', 'right'] as const).map((pos) => ({
    id: pos,
    label: t(`settings.${pos}`),
    icon: pos === 'left' ? PanelLeftOpen : PanelRightOpen
  }))
);

const languages = [
  { id: 'pl', label: 'Polski', native: 'Polski', flag: '🇵🇱' },
  { id: 'en', label: 'English', native: 'English', flag: '🇬🇧' }
];

async function setLocale(loc: string) {
  if (loc !== 'pl' && loc !== 'en') return;
  await loadLocaleMessages(loc);
  settings.updateAppearance({ locale: loc });
  try {
    localStorage.setItem('onda-locale', loc);
  } catch {
    /* noop */
  }
}
</script>

<template>
  <SettingsPanel :title="$t('settings.appearanceSection')">
    <template #actions>
      <button
        class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:bg-base-content/10 hover:text-base-content transition-colors"
        :title="$t('settings.reset')"
        @click="settings.resetToDefaults"
      >
        <RotateCcw :size="14" />
      </button>
    </template>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.language')" />
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          v-for="lang in languages"
          :key="lang.id"
          class="flex items-center gap-3 p-4 fx-depth rounded-box fx-noise border transition-all text-left"
          :class="
            settings.appearance.locale === lang.id
              ? 'border-primary shadow-lg shadow-primary/20'
              : 'border-base-300 hover:border-base-300'
          "
          @click="setLocale(lang.id)"
        >
          <span class="text-2xl">{{ lang.flag }}</span>
          <div>
            <div class="text-sm font-medium">{{ lang.native }}</div>
            <div class="text-xs text-base-content/70">{{ lang.label }}</div>
          </div>
        </button>
      </div>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle
        :title="`${$t('settings.fontSize')}: ${settings.appearance.fontSize}px`"
      />
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
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.sidebarPosition')" />
      <SettingsPositionGrid
        :model-value="settings.appearance.sidebarPosition"
        :options="sidebarPositionOptions"
        :selected-label="t(`settings.${settings.appearance.sidebarPosition}`)"
        @update:model-value="
          settings.updateAppearance({ sidebarPosition: $event as 'left' | 'right' })
        "
      />
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.sidebarSections')" />
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
        <SettingsRow :label="$t('settings.animations')" :description="$t('settings.animationsDesc')">
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
    </SettingsCard>
  </SettingsPanel>
</template>
