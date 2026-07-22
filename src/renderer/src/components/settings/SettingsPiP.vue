<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { CornerUpRight, CornerUpLeft, CornerDownRight, CornerDownLeft } from '@lucide/vue';

const settings = useSettingsStore();

const pipPositions = [
  { id: 'top-left' as const, labelKey: 'settings.topLeft', row: 0, col: 0, icon: CornerUpLeft },
  { id: 'top-right' as const, labelKey: 'settings.topRight', row: 0, col: 1, icon: CornerUpRight },
  { id: 'bottom-left' as const, labelKey: 'settings.bottomLeft', row: 1, col: 0, icon: CornerDownLeft },
  { id: 'bottom-right' as const, labelKey: 'settings.bottomRight', row: 1, col: 1, icon: CornerDownRight }
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
    <h2 class="text-lg font-bold">{{ $t('settings.pip') }}</h2>
    <p class="text-xs text-fg-faint mb-4">
      {{ $t('settings.pipDesc') }}
    </p>

    <div class="p-4 rounded-xl bg-bg-elevated border border-border-default space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-border-default">
        <span class="text-sm">{{ $t('settings.pipPreview') }}</span>
        <button
          class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          :class="
            pipPreviewOpen
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-accent-base text-white hover:bg-accent-hover'
          "
          @click="toggleSettingsPiP"
        >
          {{ pipPreviewOpen ? $t('settings.closePreview') : $t('settings.showPreview') }}
        </button>
      </div>

      <div>
        <h3 class="text-sm font-semibold mb-3">Pozycja okna</h3>
        <div class="w-48 aspect-square rounded-2xl bg-bg-elevated border-2 border-border-default p-2 relative select-none">
          <div class="grid grid-cols-2 grid-rows-2 gap-2 w-full h-full">
            <button
              v-for="p in pipPositions"
              :key="p.id"
              class="rounded-xl text-[11px] font-medium transition-all border-2 flex flex-col items-center justify-center gap-1"
              :class="settings.playback.pipPosition === p.id
                ? 'border-accent-base bg-accent-ghost text-accent-base shadow-sm shadow-accent-base/20'
                : 'border-transparent text-fg-faint hover:bg-bg-hover hover:text-fg-muted'"
              @click="settings.updatePlayback({ pipPosition: p.id })"
            >
              <component :is="p.icon" :size="16" />
              <span>{{ $t(p.labelKey) }}</span>
            </button>
          </div>
          <div class="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div class="w-5 h-5 rounded border-2 border-dashed border-fg-faint/20" />
          </div>
        </div>
        <p class="text-[11px] text-fg-faint mt-2">
          {{ $t('settings.selected') }} <span class="text-fg-base font-medium">{{ $t(pipPositions.find(p => p.id === settings.playback.pipPosition)?.labelKey ?? '') }}</span>
        </p>
      </div>

      <div>
        <h3 class="text-sm font-semibold mb-3">{{ $t('settings.width') }} {{ settings.playback.pipWidth }}px</h3>
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
        <h3 class="text-sm font-semibold mb-3">{{ $t('settings.height') }} {{ settings.playback.pipHeight }}px</h3>
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
