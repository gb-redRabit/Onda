<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import AudioVisualizer from '@renderer/components/audio/AudioVisualizer.vue';
import AudioControls from '@renderer/components/audio/AudioControls.vue';
import AudioProgressBar from '@renderer/components/audio/AudioProgressBar.vue';
import AudioLayoutToggle from '@renderer/components/audio/AudioLayoutToggle.vue';
import AudioCover from '@renderer/components/audio/AudioCover.vue';
import AudioTrackInfo from '@renderer/components/audio/AudioTrackInfo.vue';
import { BarChart3 } from '@lucide/vue';

const player = usePlayerStore();
const audio = useAudioPlayer();

const layoutMode = ref<'split' | 'full' | 'stacked'>('split');
const showUI = ref(true);
const uiTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
const vizRef = ref<InstanceType<typeof AudioVisualizer> | null>(null);

function hideUIAfterDelay() {
  if (uiTimeout.value) clearTimeout(uiTimeout.value);
  uiTimeout.value = setTimeout(() => {
    if (audio.isPlaying.value) showUI.value = false;
  }, 3000);
}

function onMouseMove() {
  showUI.value = true;
  hideUIAfterDelay();
}

watch(
  () => audio.isPlaying.value,
  (playing) => {
    if (playing) hideUIAfterDelay();
    else {
      showUI.value = true;
      if (uiTimeout.value) clearTimeout(uiTimeout.value);
    }
  }
);

function skip(seconds: number) {
  const newTime = Math.max(0, Math.min(audio.duration.value, audio.currentTime.value + seconds));
  audio.seek(newTime);
}

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    return;
  switch (e.key) {
    case ' ':
    case 'k':
      e.preventDefault();
      audio.isPlaying.value ? audio.pause() : audio.play();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      skip(e.shiftKey ? -30 : -10);
      break;
    case 'ArrowRight':
      e.preventDefault();
      skip(e.shiftKey ? 30 : 10);
      break;
    case 'ArrowUp':
      e.preventDefault();
      audio.setVolume(Math.min(1, audio.volume.value + 0.05));
      break;
    case 'ArrowDown':
      e.preventDefault();
      audio.setVolume(Math.max(0, audio.volume.value - 0.05));
      break;
    case 'm':
      e.preventDefault();
      player.toggleMute();
      break;
    case '0':
      e.preventDefault();
      audio.seek(0);
      break;
    case 'f':
      e.preventDefault();
      if (player.currentTrack) player.toggleFavorite(player.currentTrack.path);
      break;
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  hideUIAfterDelay();
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  if (uiTimeout.value) clearTimeout(uiTimeout.value);
});
</script>

<template>
  <div class="h-full w-full bg-bg-base select-none" @mousemove="onMouseMove">
    <!-- LAYOUT TOGGLE — bottom-right, always visible -->
    <div
      class="absolute top-4 left-4 z-30 transition-opacity"
      :class="{ 'opacity-0': !showUI, 'opacity-100': showUI }"
    >
      <AudioLayoutToggle v-model:mode="layoutMode" />
    </div>

    <!-- ═══════ FULL layout — visualizer as background ═══════ -->
    <div v-if="layoutMode === 'full'" class="h-full w-full relative overflow-hidden">
      <div class="absolute inset-0 opacity-60">
        <AudioVisualizer ref="vizRef" />
      </div>
      <div class="absolute inset-0 bg-gradient-to-t from-bg-base/90 via-bg-base/40 to-bg-base/60" />
      <div class="absolute inset-0 flex flex-col items-center justify-center z-10 px-8">
        <AudioCover size="w-96 h-96" class="mb-6" />
        <div class="text-center mb-6 max-w-md">
          <AudioTrackInfo title-size="text-xl" />
        </div>
        <div
          class="w-full max-w-md mb-3 transition-opacity"
          :class="{ 'opacity-0': !showUI, 'opacity-100': showUI }"
        >
          <AudioProgressBar />
        </div>
        <div class="transition-opacity" :class="{ 'opacity-0': !showUI, 'opacity-100': showUI }">
          <AudioControls />
        </div>
      </div>

      <!-- viz mode — bottom-left -->
      <button
        class="absolute bottom-4 left-4 z-20 p-2 rounded-lg bg-bg-overlay/80 backdrop-blur-sm text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-all opacity-0 hover:opacity-100 focus:opacity-100"
        :class="{ 'opacity-60': showUI }"
        title="Tryb wizualizacji"
        @click="vizRef?.cycleStyle()"
      >
        <div class="flex items-center gap-1.5">
          <BarChart3 :size="14" />
          <span class="text-[10px] uppercase font-medium">{{ vizRef?.style ?? 'bars' }}</span>
        </div>
      </button>
    </div>

    <!-- ═══════ SPLIT layout — cover left, visualizer right ═══════ -->
    <div v-else-if="layoutMode === 'split'" class="h-full w-full flex overflow-hidden">
      <div class="flex-1 flex flex-col items-center justify-center px-8 min-w-0">
        <AudioCover size="w-96 h-96 shadow-xl shadow-black/30" class="mb-6" />
        <div class="text-center mb-4 max-w-sm w-full">
          <AudioTrackInfo />
        </div>
        <div
          class="w-full max-w-sm mb-5 transition-opacity"
          :class="{ 'opacity-0': !showUI, 'opacity-100': showUI }"
        >
          <AudioProgressBar />
        </div>
        <div class="transition-opacity" :class="{ 'opacity-0': !showUI, 'opacity-100': showUI }">
          <AudioControls />
        </div>
      </div>
      <div class="w-1/2 h-full shrink-0 p-4 pl-0">
        <AudioVisualizer class="h-full" />
      </div>
    </div>

    <!-- ═══════ STACKED layout — cover top, viz middle, controls bottom ═══════ -->
    <div v-else class="h-full w-full flex flex-col items-center overflow-auto">
      <div class="flex flex-col items-center max-w-sm w-full px-6 py-8">
        <AudioCover size="w-96 h-96 shadow-xl shadow-black/30" class="mb-5" />
        <div class="text-center mb-4">
          <AudioTrackInfo />
        </div>
        <div
          class="w-full mb-5 transition-opacity"
          :class="{ 'opacity-0': !showUI, 'opacity-100': showUI }"
        >
          <AudioProgressBar />
        </div>
        <div class="w-full h-36 mb-5">
          <AudioVisualizer class="h-full" />
        </div>
        <div class="transition-opacity" :class="{ 'opacity-0': !showUI, 'opacity-100': showUI }">
          <AudioControls />
        </div>
      </div>
    </div>
  </div>
</template>
