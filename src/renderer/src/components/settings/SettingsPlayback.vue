<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';
import SettingsPanel from '@renderer/components/settings/SettingsPanel.vue';
import SettingsCard from '@renderer/components/settings/SettingsCard.vue';
import SettingsSectionTitle from '@renderer/components/settings/SettingsSectionTitle.vue';
import SettingsRow from '@renderer/components/settings/SettingsRow.vue';
import SettingsToggle from '@renderer/components/settings/SettingsToggle.vue';

const settings = useSettingsStore();

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
  <SettingsPanel :title="$t('settings.playbackSection')">
    <SettingsCard>
      <SettingsSectionTitle
        :title="`${$t('settings.defaultVolume')} ${Math.round(settings.playback.defaultVolume * 100)}%`"
      />
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
    </SettingsCard>

    <SettingsCard>
      <div class="divide-y divide-base-300">
        <SettingsRow v-for="opt in toggles" :key="opt.key" :label="$t(opt.labelKey) ?? ''">
          <SettingsToggle
            :model-value="settings.playback[opt.key]"
            @update:model-value="settings.updatePlayback({ [opt.key]: $event })"
          />
        </SettingsRow>
      </div>
    </SettingsCard>

    <SettingsCard v-if="settings.playback.cursorHide">
      <SettingsSectionTitle
        :title="`${$t('settings.cursorHideTimeout')} ${settings.playback.cursorTimeout}s`"
      />
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
    </SettingsCard>

    <SettingsCard v-if="settings.playback.rememberPosition">
      <SettingsSectionTitle
        :title="`${$t('settings.resumePromptTimeout')} ${settings.playback.resumePromptTimeout}s`"
      />
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
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle
        :title="`${$t('settings.defaultSpeed')} ${settings.playback.playbackSpeed}x`"
      />
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
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.defaultPlayer')" />
      <div class="flex gap-2">
        <button
          v-for="p in ['html5', 'vlc'] as const"
          :key="p"
          class="px-3 py-1.5 rounded-field text-xs font-medium border transition-colors"
          :class="
            settings.playback.defaultPlayer === p
              ? 'bg-primary text-primary-content border-primary'
              : 'bg-base-100 border-base-300 hover:bg-base-200'
          "
          @click="settings.updatePlayback({ defaultPlayer: p })"
        >
          {{ p.toUpperCase() }}
        </button>
      </div>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.videoFilter')" />
      <select
        :value="settings.playback.videoFilter"
        class="w-full px-3 py-2 rounded-field bg-base-100 border border-base-300 text-sm"
        @change="
          settings.updatePlayback({ videoFilter: ($event.target as HTMLSelectElement).value })
        "
      >
        <option value="none">None</option>
        <option value="grayscale(100%)">Grayscale</option>
        <option value="sepia(100%)">Sepia</option>
        <option value="invert(100%)">Invert</option>
        <option value="contrast(150%)">High Contrast</option>
      </select>
    </SettingsCard>

    <SettingsCard>
      <SettingsSectionTitle :title="$t('settings.visualization')" />
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
                  mode: ($event.target as HTMLSelectElement).value as any
                }
              })
            "
          >
            <option value="none">None</option>
            <option value="circle">Circle</option>
            <option value="bars">Bars</option>
            <option value="particles">Particles</option>
            <option value="wave">Wave</option>
            <option value="radial">Radial</option>
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
            >{{ $t('settings.vizSensitivity') }} {{ settings.playback.visualization.sensitivity }}</span
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
    </SettingsCard>

  </SettingsPanel>
</template>
