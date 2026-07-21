<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings';

const settings = useSettingsStore();

const audioFormats = ['mp3', 'flac', 'ogg', 'aac'] as const;
const videoQualities = ['best', '1080p', '720p', '480p'] as const;
</script>

<template>
  <div class="space-y-6 max-w-2xl">
    <h2 class="text-lg font-bold">Pobieranie</h2>

    <div>
      <h3 class="text-sm font-semibold mb-3">Domyślny format audio</h3>
      <div class="flex gap-2">
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
    </div>

    <div>
      <h3 class="text-sm font-semibold mb-3">Domyślna jakość wideo</h3>
      <div class="flex gap-2">
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
    </div>

    <div>
      <h3 class="text-sm font-semibold mb-3">Szablon nazwy pliku</h3>
      <input
        :value="settings.download.filenameTemplate"
        class="w-full px-3 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none"
        @change="
          settings.updateDownload({ filenameTemplate: ($event.target as HTMLInputElement).value })
        "
      />
      <p class="text-xs text-fg-faint mt-1">
        Dostępne: {'{title}'}, {'{artist}'}, {'{album}'}, {'{year}'}
      </p>
    </div>

    <div>
      <h3 class="text-sm font-semibold mb-3">
        Maks. równoległych: {{ settings.download.maxConcurrent }}
      </h3>
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
    </div>
  </div>
</template>
