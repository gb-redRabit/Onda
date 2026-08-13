<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
import FilenameTemplatePresets from '@renderer/components/FilenameTemplatePresets.vue';
import { AUDIO_FORMATS, VIDEO_QUALITIES, VIDEO_CONTAINERS } from '@shared/constants';

const settings = useSettingsStore();

const audioFormats = AUDIO_FORMATS;
const videoQualities = VIDEO_QUALITIES;
const videoContainers = VIDEO_CONTAINERS;
const audioQualities = ['best', 'high', 'medium', 'low'] as const;
const coverTypes = ['thumbnail', 'none', 'frame', 'clip'] as const;
</script>

<template>
  <SettingsPanel
    :title="$t('settings.smartModeTab')"
    :description="$t('settings.smartModeTabDesc')"
  >
    <SettingsCard>
      <SettingsRow :label="$t('settings.smartMode')" :description="$t('settings.smartModeDesc')">
        <SettingsToggle
          :model-value="settings.download.smartMode"
          @update:model-value="settings.updateDownload({ smartMode: $event })"
        />
      </SettingsRow>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.defaultKind')" />
      <div class="flex gap-1 bg-bg-base rounded-xl p-1 w-fit">
        <button
          v-for="k in ['audio', 'video'] as const"
          :key="k"
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="
            settings.download.defaultKind === k
              ? 'bg-accent-base text-white'
              : 'text-fg-muted hover:text-fg-base'
          "
          @click="settings.updateDownload({ defaultKind: k })"
        >
          {{ k === 'audio' ? $t('youtube.prefAudio') : $t('youtube.prefVideo') }}
        </button>
      </div>
    </SettingsCard>

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
          {{ f === 'best' ? $t('settings.audioNative') : f }}
        </button>
      </div>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.defaultAudioQuality')" />
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          v-for="q in audioQualities"
          :key="q"
          class="px-4 py-2 rounded-xl text-sm border transition-colors font-medium"
          :class="
            settings.download.defaultAudioQuality === q
              ? 'border-accent-base bg-accent-ghost text-accent-base'
              : 'border-border-default text-fg-muted hover:bg-bg-hover'
          "
          @click="settings.updateDownload({ defaultAudioQuality: q })"
        >
          {{ $t('settings.audioQuality.' + q) }}
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
      <SettingsSectionTitle :title="$t('settings.defaultVideoContainer')" />
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="c in videoContainers"
          :key="c"
          class="px-4 py-2 rounded-xl text-sm uppercase border transition-colors font-medium"
          :class="
            settings.download.defaultVideoContainer === c
              ? 'border-accent-base bg-accent-ghost text-accent-base'
              : 'border-border-default text-fg-muted hover:bg-bg-hover'
          "
          @click="settings.updateDownload({ defaultVideoContainer: c })"
        >
          {{ c }}
        </button>
      </div>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.defaultCover')" />
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          v-for="c in coverTypes"
          :key="c"
          class="px-4 py-2 rounded-xl text-sm border transition-colors font-medium"
          :class="
            settings.download.defaultCover === c
              ? 'border-accent-base bg-accent-ghost text-accent-base'
              : 'border-border-default text-fg-muted hover:bg-bg-hover'
          "
          @click="settings.updateDownload({ defaultCover: c })"
        >
          {{ $t('settings.cover.' + c) }}
        </button>
      </div>
      <div v-if="settings.download.defaultCover === 'frame'" class="mt-3">
        <SettingsSectionTitle
          :title="`${$t('youtube.frameTimeLabel')}: ${settings.download.defaultCoverFrameTime}s`"
        />
        <input
          type="range"
          min="0"
          max="300"
          step="1"
          :value="settings.download.defaultCoverFrameTime"
          class="w-full"
          @input="
            settings.updateDownload({
              defaultCoverFrameTime: parseInt(($event.target as HTMLInputElement).value)
            })
          "
        />
      </div>
      <div
        v-else-if="settings.download.defaultCover === 'clip'"
        class="mt-3 grid grid-cols-2 gap-3"
      >
        <div>
          <SettingsSectionTitle :title="$t('youtube.clipStartLabel')" />
          <input
            type="number"
            min="0"
            :value="settings.download.defaultCoverClipStart"
            class="w-full px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
            @change="
              settings.updateDownload({
                defaultCoverClipStart: parseInt(($event.target as HTMLInputElement).value) || 0
              })
            "
          />
        </div>
        <div>
          <SettingsSectionTitle :title="$t('youtube.clipEndLabel')" />
          <input
            type="number"
            min="1"
            :value="settings.download.defaultCoverClipEnd"
            class="w-full px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
            @change="
              settings.updateDownload({
                defaultCoverClipEnd: parseInt(($event.target as HTMLInputElement).value) || 30
              })
            "
          />
        </div>
      </div>
    </SettingsCard>

    <SettingsCard>
      <SettingsRow
        :label="$t('settings.defaultSubs')"
        :description="$t('settings.defaultSubsDesc')"
      >
        <SettingsToggle
          :model-value="settings.download.defaultSubs"
          @update:model-value="settings.updateDownload({ defaultSubs: $event })"
        />
      </SettingsRow>
      <div v-if="settings.download.defaultSubs" class="pt-1">
        <SettingsSectionTitle :title="$t('settings.defaultSubsLangs')" />
        <input
          :value="settings.download.defaultSubsLangs"
          class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none focus:ring-2 focus:ring-accent-base/15 transition-all"
          :placeholder="$t('youtube.subsLangsPlaceholder')"
          @change="
            settings.updateDownload({
              defaultSubsLangs: ($event.target as HTMLInputElement).value
            })
          "
        />
      </div>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.filenameTemplate')" />
      <div class="flex items-center gap-2">
        <input
          :value="settings.download.filenameTemplate"
          class="flex-1 px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none focus:ring-2 focus:ring-accent-base/15 transition-all"
          @change="
            settings.updateDownload({ filenameTemplate: ($event.target as HTMLInputElement).value })
          "
        />
        <FilenameTemplatePresets @preset="settings.updateDownload({ filenameTemplate: $event })" />
      </div>
      <p class="text-xs text-fg-faint">
        {{ $t('settings.available') }} {'{title}'}, {'{artist}'}, {'{album}'}, {'{year}'}
      </p>
    </SettingsCard>
  </SettingsPanel>
</template>
