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
      <div class="divide-y divide-border-default">
        <SettingsRow
          v-for="opt in toggles"
          :key="opt.key"
          :label="$t(opt.labelKey) ?? ''"
        >
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
  </SettingsPanel>
</template>
