<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';

const settings = useSettingsStore();

const audioFormats = ['mp3', 'flac', 'ogg', 'aac'] as const;
const videoQualities = ['best', '1080p', '720p', '480p'] as const;
</script>

<template>
  <SettingsPanel :title="$t('settings.downloadSection')">
    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.defaultAudioFormat')" />
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          v-for="f in audioFormats"
          :key="f"
          class="px-4 py-2 rounded-xl text-sm uppercase border transition-colors font-medium"
          :class="
            settings.download.defaultAudioFormat === f
              ? 'border-accent-base bg-accent-ghost text-accent-base'
              : 'border-border-default text-fg-muted hover:bg-bg-hover'
          "
          @click="settings.updateDownload({ defaultAudioFormat: f })"
        >
          {{ f }}
        </button>
      </div>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.defaultVideoQuality')" />
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          v-for="q in videoQualities"
          :key="q"
          class="px-4 py-2 rounded-xl text-sm border transition-colors"
          :class="
            settings.download.defaultVideoQuality === q
              ? 'border-accent-base bg-accent-ghost text-accent-base font-medium'
              : 'border-border-default text-fg-muted hover:bg-bg-hover'
          "
          @click="settings.updateDownload({ defaultVideoQuality: q })"
        >
          {{ q }}
        </button>
      </div>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.filenameTemplate')" />
      <input
        :value="settings.download.filenameTemplate"
        class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none focus:ring-2 focus:ring-accent-base/15 transition-all"
        @change="
          settings.updateDownload({ filenameTemplate: ($event.target as HTMLInputElement).value })
        "
      />
      <p class="text-xs text-fg-faint">
        {{ $t('settings.available') }} {'{title}'}, {'{artist}'}, {'{album}'}, {'{year}'}
      </p>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle
        :title="`${$t('settings.maxConcurrent')} ${settings.download.maxConcurrent}`"
      />
      <input
        type="range"
        min="1"
        max="10"
        :value="settings.download.maxConcurrent"
        class="w-full"
        @input="
          settings.updateDownload({
            maxConcurrent: parseInt(($event.target as HTMLInputElement).value)
          })
        "
      />
    </SettingsCard>
  </SettingsPanel>
</template>
