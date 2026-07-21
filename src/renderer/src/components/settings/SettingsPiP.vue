<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';

const settings = useSettingsStore();

const pipPositions = [
  { value: 'bottom-right' as const, label: 'Prawy dolny' },
  { value: 'bottom-left' as const, label: 'Lewy dolny' },
  { value: 'top-right' as const, label: 'Prawy górny' },
  { value: 'top-left' as const, label: 'Lewy górny' }
];

const pipPreviewOpen = ref(false);

async function toggleSettingsPiP() {
  if (pipPreviewOpen.value) {
    await window.api?.pipPreviewStop();
    pipPreviewOpen.value = false;
    return;
  }
  const started = await window.api?.pipPreviewStart({
    position: settings.playback.pipPosition,
    width: settings.playback.pipWidth,
    height: settings.playback.pipHeight
  });
  if (started) pipPreviewOpen.value = true;
}

watch(
  () => [settings.playback.pipPosition, settings.playback.pipWidth, settings.playback.pipHeight],
  () => {
    if (pipPreviewOpen.value) {
      window.api?.pipPreviewUpdate({
        position: settings.playback.pipPosition,
        width: settings.playback.pipWidth,
        height: settings.playback.pipHeight
      });
    }
  }
);
</script>

<template>
  <div class="space-y-6 max-w-2xl">
    <h2 class="text-lg font-bold">Obraz w obrazie (PiP)</h2>
    <p class="text-xs text-fg-faint mb-4">
      Dostosuj ustawienia PiP. Zmiany są widoczne natychmiast jeśli PiP jest otwarte.
    </p>

    <div class="p-4 rounded-xl bg-bg-elevated border border-border-default space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-border-default">
        <span class="text-sm">Podgląd PiP</span>
        <button
          class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          :class="
            pipPreviewOpen
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-accent-base text-white hover:bg-accent-hover'
          "
          @click="toggleSettingsPiP"
        >
          {{ pipPreviewOpen ? 'Zamknij podgląd' : 'Pokaż podgląd' }}
        </button>
      </div>

      <div>
        <h3 class="text-sm font-semibold mb-3">Pozycja okna</h3>
        <div class="flex gap-2">
          <button
            v-for="p in pipPositions"
            :key="p.value"
            class="px-4 py-2 rounded-xl text-sm border transition-colors"
            :class="
              settings.playback.pipPosition === p.value
                ? 'border-accent-base bg-accent-ghost text-accent-base font-medium'
                : 'border-border-default text-fg-muted hover:bg-bg-hover'
            "
            @click="settings.updatePlayback({ pipPosition: p.value })"
          >
            {{ p.label }}
          </button>
        </div>
      </div>

      <div>
        <h3 class="text-sm font-semibold mb-3">Szerokość: {{ settings.playback.pipWidth }}px</h3>
        <input
          type="range"
          min="240"
          max="1200"
          step="10"
          :value="settings.playback.pipWidth"
          class="w-full"
          @input="
            settings.updatePlayback({
              pipWidth: parseInt(($event.target as HTMLInputElement).value)
            })
          "
        />
      </div>

      <div>
        <h3 class="text-sm font-semibold mb-3">Wysokość: {{ settings.playback.pipHeight }}px</h3>
        <input
          type="range"
          min="140"
          max="800"
          step="10"
          :value="settings.playback.pipHeight"
          class="w-full"
          @input="
            settings.updatePlayback({
              pipHeight: parseInt(($event.target as HTMLInputElement).value)
            })
          "
        />
      </div>
    </div>
  </div>
</template>
