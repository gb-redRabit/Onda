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

const themes: {
  id: typeof settings.appearance.theme;
  labelKey?: string;
  label: string;
  bg: string;
  fg: string;
}[] = [
  { id: 'dark', labelKey: 'settings.dark', label: 'Ciemny', bg: '#0f0f17', fg: '#e8e8f0' },
  { id: 'light', labelKey: 'settings.light', label: 'Jasny', bg: '#f8f8fa', fg: '#1a1a2e' },
  { id: 'midnight', label: 'Midnight', bg: '#0d1117', fg: '#c9d1d9' },
  { id: 'spotify', label: 'Spotify', bg: '#121212', fg: '#b3b3b3' },
  { id: 'custom', labelKey: 'settings.custom', label: 'Własny', bg: '#7c6aef', fg: '#ffffff' }
];

const accentColors = [
  '#7c6aef',
  '#3b82f6',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4'
];
</script>

<template>
  <SettingsPanel :title="$t('settings.appearanceSection')">
    <template #actions>
      <button
        class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover hover:text-fg-base transition-colors"
        :title="$t('settings.reset')"
        @click="settings.resetToDefaults"
      >
        <RotateCcw :size="14" />
      </button>
    </template>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.theme')" />
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          v-for="th in themes"
          :key="th.id"
          class="p-3 rounded-xl border-2 transition-all text-center"
          :class="
            settings.appearance.theme === th.id
              ? 'border-accent-base shadow-lg shadow-accent-base/20'
              : 'border-border-default hover:border-border-subtle'
          "
          @click="settings.updateAppearance({ theme: th.id })"
        >
          <div
            class="w-full h-8 rounded-lg mb-2 flex items-center justify-center"
            :style="{
              backgroundColor:
                th.id === 'custom' ? settings.appearance.customBackground || '#7c6aef' : th.bg
            }"
          >
            <div class="w-6 h-1 rounded-full" style="background: #7c6aef" />
          </div>
          <span class="text-xs text-fg-muted">{{ th.labelKey ? $t(th.labelKey) : th.label }}</span>
        </button>
      </div>
    </SettingsCard>

    <SettingsCard v-if="settings.appearance.theme === 'custom'">
      <SettingsSectionTitle :title="$t('settings.customBackground')" />
      <div class="flex items-center gap-4">
        <input
          type="color"
          class="w-12 h-10 rounded-lg bg-bg-base border border-border-default cursor-pointer"
          :value="settings.appearance.customBackground || '#0f0f17'"
          @input="
            settings.updateAppearance({
              customBackground: ($event.target as HTMLInputElement).value
            })
          "
        />
        <span class="text-sm font-mono text-fg-muted">
          {{ settings.appearance.customBackground || '#0f0f17' }}
        </span>
      </div>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.language')" />
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          v-for="lang in languages"
          :key="lang.id"
          class="flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left"
          :class="
            settings.appearance.locale === lang.id
              ? 'border-accent-base shadow-lg shadow-accent-base/20'
              : 'border-border-default hover:border-border-subtle'
          "
          @click="setLocale(lang.id)"
        >
          <span class="text-2xl">{{ lang.flag }}</span>
          <div>
            <div class="text-sm font-medium">{{ lang.native }}</div>
            <div class="text-xs text-fg-muted">{{ lang.label }}</div>
          </div>
        </button>
      </div>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.accentColor')" />
      <div class="flex flex-wrap gap-2">
        <button
          v-for="c in accentColors"
          :key="c"
          class="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
          :class="
            settings.appearance.accentColor === c ? 'border-white scale-110' : 'border-transparent'
          "
          :style="{ backgroundColor: c }"
          @click="settings.updateAppearance({ accentColor: c })"
        />
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
      <SettingsSectionTitle :title="$t('settings.density')" />
      <div class="flex flex-wrap gap-2">
        <button
          v-for="d in ['compact', 'comfortable', 'spacious'] as const"
          :key="d"
          class="px-4 py-2 rounded-xl text-sm capitalize border transition-colors"
          :class="
            settings.appearance.density === d
              ? 'border-accent-base bg-accent-ghost text-accent-base font-medium'
              : 'border-border-default text-fg-muted hover:bg-bg-hover'
          "
          @click="settings.updateAppearance({ density: d })"
        >
          {{ $t('settings.' + d) }}
        </button>
      </div>
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
      <div class="divide-y divide-border-default">
        <SettingsRow :label="$t('library.playlists')">
          <input
            type="checkbox"
            :checked="settings.appearance.showPlaylists"
            class="w-4 h-4 rounded accent-accent-base"
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
            class="w-4 h-4 rounded accent-accent-base"
            @change="
              settings.updateAppearance({ showAlbums: ($event.target as HTMLInputElement).checked })
            "
          />
        </SettingsRow>
        <SettingsRow :label="$t('settings.sidebarCollapsed')">
          <input
            type="checkbox"
            :checked="settings.appearance.sidebarCollapsed"
            class="w-4 h-4 rounded accent-accent-base"
            @change="
              settings.updateAppearance({
                sidebarCollapsed: ($event.target as HTMLInputElement).checked
              })
            "
          />
        </SettingsRow>
      </div>
    </SettingsCard>
  </SettingsPanel>
</template>
