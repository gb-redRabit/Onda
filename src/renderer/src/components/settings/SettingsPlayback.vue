<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';

const settings = useSettingsStore();

const toggles = [
  { key: 'gaplessPlayback' as const, labelKey: 'settings.gapless' },
  { key: 'normalization' as const, labelKey: 'settings.volumeNorm' },
  { key: 'replayGain' as const, label: 'Replay Gain' },
  { key: 'autoPauseOnFocusLoss' as const, labelKey: 'settings.autoPause' },
  { key: 'rememberPosition' as const, labelKey: 'settings.rememberPos' },
  { key: 'cursorHide' as const, labelKey: 'settings.hideCursor' }
];
</script>

<template>
  <div class="space-y-6 max-w-2xl">
    <h2 class="text-lg font-bold">{{ $t('settings.playbackSection') }}</h2>

    <div>
      <h3 class="text-sm font-semibold mb-3">
        {{ $t('settings.defaultVolume') }} {{ Math.round(settings.playback.defaultVolume * 100) }}%
      </h3>
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
    </div>

    <div class="space-y-1">
      <div
        v-for="opt in toggles"
        :key="opt.key"
        class="flex items-center justify-between py-2.5 border-b border-border-default"
      >
        <span class="text-sm">{{ opt.labelKey ? $t(opt.labelKey) : opt.label }}</span>
        <button
          class="relative w-10 h-5.5 rounded-full transition-colors"
          :class="settings.playback[opt.key] ? 'bg-accent-base' : 'bg-border-subtle'"
          @click="settings.updatePlayback({ [opt.key]: !settings.playback[opt.key] })"
        >
          <div
            class="absolute top-0.75 w-4 h-4 rounded-full bg-white shadow transition-all"
            :class="settings.playback[opt.key] ? 'left-5.5' : 'left-0.75'"
          />
        </button>
      </div>
    </div>

    <div v-if="settings.playback.cursorHide">
      <h3 class="text-sm font-semibold mb-3">
        {{ $t('settings.cursorHideTimeout') }} {{ settings.playback.cursorTimeout }}s
      </h3>
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
    </div>

    <div>
      <h3 class="text-sm font-semibold mb-3">
        {{ $t('settings.defaultSpeed') }} {{ settings.playback.playbackSpeed }}x
      </h3>
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
    </div>
  </div>
</template>
