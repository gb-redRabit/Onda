<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';
import SettingsGroup from '@renderer/components/settings/SettingsGroup.vue';
import { readSelect } from '@renderer/utils/selectOptions';

const settings = useSettingsStore();

/** Te same wartości, z których renderowane są opcje poniżej. */
const VIZ_MODES = ['none', 'circle', 'bars', 'particles', 'wave', 'radial'] as const;

const toggles = [
  { key: 'gaplessPlayback' as const, labelKey: 'settings.gapless' },
  { key: 'normalization' as const, labelKey: 'settings.volumeNorm' },
  { key: 'replayGain' as const, labelKey: 'settings.replayGain' },
  { key: 'autoPauseOnFocusLoss' as const, labelKey: 'settings.autoPause' },
  { key: 'rememberPosition' as const, labelKey: 'settings.rememberPos' },
  { key: 'cursorHide' as const, labelKey: 'settings.hideCursor' }
];
</script>

<template>
  <SettingsGroup>
    <SettingsRow
      :label="$t('settings.defaultVolume')"
      :description="`${Math.round(settings.playback.defaultVolume * 100)}%`"
      path="playback.defaultVolume"
      anchor="setting-default-volume"
      wide
    >
      <input
        type="range"
        min="0"
        max="100"
        :value="Math.round(settings.playback.defaultVolume * 100)"
        class="w-full"
        @input="
          settings.updatePlayback({
            defaultVolume: parseInt(($event.target as HTMLInputElement).value) / 100
          })
        "
      />
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup>
    <div class="divide-y divide-base-300">
      <SettingsRow v-for="opt in toggles" :key="opt.key" :label="$t(opt.labelKey) ?? ''">
        <SettingsToggle
          :model-value="settings.playback[opt.key]"
          @update:model-value="settings.updatePlayback({ [opt.key]: $event })"
        />
      </SettingsRow>
    </div>
  </SettingsGroup>

  <SettingsGroup
    v-if="settings.playback.cursorHide"
    :title="`${$t('settings.cursorHideTimeout')} ${settings.playback.cursorTimeout}s`"
  >
    <input
      type="range"
      min="1"
      max="10"
      step="1"
      :value="settings.playback.cursorTimeout"
      class="w-full"
      @input="
        settings.updatePlayback({
          cursorTimeout: parseInt(($event.target as HTMLInputElement).value)
        })
      "
    />
    <p class="text-[11px] text-base-content/50 mt-2">{{ $t('settings.cursorHideHint') }}</p>
  </SettingsGroup>

  <SettingsGroup
    v-if="settings.playback.rememberPosition"
    :title="`${$t('settings.resumePromptTimeout')} ${settings.playback.resumePromptTimeout}s`"
  >
    <input
      type="range"
      min="1"
      max="15"
      step="1"
      :value="settings.playback.resumePromptTimeout"
      class="w-full"
      @input="
        settings.updatePlayback({
          resumePromptTimeout: parseInt(($event.target as HTMLInputElement).value)
        })
      "
    />
    <p class="text-[11px] text-base-content/50 mt-2">{{ $t('settings.resumePromptHint') }}</p>
  </SettingsGroup>

  <SettingsGroup>
    <SettingsRow
      :label="$t('settings.defaultSpeed')"
      :description="`${settings.playback.playbackSpeed}x`"
      path="playback.playbackSpeed"
      anchor="setting-playback-speed"
      wide
    >
      <input
        type="range"
        min="0.2"
        max="3"
        step="0.25"
        :value="settings.playback.playbackSpeed"
        class="w-full"
        @input="
          settings.updatePlayback({
            playbackSpeed: parseFloat(($event.target as HTMLInputElement).value)
          })
        "
      />
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup :title="$t('settings.videoFilter')">
    <SettingsRow
      :label="$t('settings.videoFilter')"
      path="playback.videoFilter"
      anchor="setting-video-filter"
    >
      <select
        :value="settings.playback.videoFilter"
        class="w-full px-3 py-2 rounded-field bg-base-100 border border-base-300 text-sm"
        @change="
          settings.updatePlayback({ videoFilter: ($event.target as HTMLSelectElement).value })
        "
      >
        <option value="none">{{ $t('videoFilters.none') }}</option>
        <option value="grayscale(100%)">{{ $t('videoFilters.grayscale') }}</option>
        <option value="sepia(80%)">{{ $t('videoFilters.sepia') }}</option>
        <option value="contrast(150%)">{{ $t('videoFilters.highContrast') }}</option>
        <option value="brightness(150%)">{{ $t('videoFilters.brightness') }}</option>
        <option value="saturate(200%)">{{ $t('videoFilters.saturation') }}</option>
        <option value="invert(100%)">{{ $t('videoFilters.invert') }}</option>
        <option value="blur(2px)">{{ $t('videoFilters.blur') }}</option>
        <option value="hue-rotate(90deg)">{{ $t('videoFilters.hueRotate') }}</option>
      </select>
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup :title="$t('settings.visualization')">
    <div class="flex flex-col gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-xs text-base-content/70">{{ $t('settings.vizMode') }}</span>
        <select
          :value="settings.playback.visualization.mode"
          class="px-3 py-2 rounded-field bg-base-100 border border-base-300 text-sm"
          @change="
            settings.updatePlayback({
              visualization: {
                ...settings.playback.visualization,
                mode: readSelect($event, VIZ_MODES)
              }
            })
          "
        >
          <option value="none">{{ $t('settings.vizModeNone') }}</option>
          <option value="circle">{{ $t('settings.vizModeCircle') }}</option>
          <option value="bars">{{ $t('settings.vizModeBars') }}</option>
          <option value="particles">{{ $t('settings.vizModeParticles') }}</option>
          <option value="wave">{{ $t('settings.vizModeWave') }}</option>
          <option value="radial">{{ $t('settings.vizModeRadial') }}</option>
        </select>
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-xs text-base-content/70">{{ $t('settings.vizPrimary') }}</span>
          <input
            type="color"
            :value="settings.playback.visualization.primaryColor"
            class="h-9 w-full rounded-field border border-base-300 p-1"
            @input="
              settings.updatePlayback({
                visualization: {
                  ...settings.playback.visualization,
                  primaryColor: ($event.target as HTMLInputElement).value
                }
              })
            "
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-base-content/70">{{ $t('settings.vizSecondary') }}</span>
          <input
            type="color"
            :value="settings.playback.visualization.secondaryColor"
            class="h-9 w-full rounded-field border border-base-300 p-1"
            @input="
              settings.updatePlayback({
                visualization: {
                  ...settings.playback.visualization,
                  secondaryColor: ($event.target as HTMLInputElement).value
                }
              })
            "
          />
        </label>
      </div>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-base-content/70"
          >{{ $t('settings.vizSensitivity') }}
          {{ settings.playback.visualization.sensitivity }}</span
        >
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          :value="settings.playback.visualization.sensitivity"
          class="w-full"
          @input="
            settings.updatePlayback({
              visualization: {
                ...settings.playback.visualization,
                sensitivity: parseFloat(($event.target as HTMLInputElement).value)
              }
            })
          "
        />
      </label>
    </div>
  </SettingsGroup>
</template>
