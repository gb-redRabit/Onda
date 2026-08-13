<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { BarChart3, Settings2, PictureInPicture2 } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { useAudioPiP } from '@renderer/composables/useAudioPiP';
import AudioVisualizer from '@renderer/components/audio/AudioVisualizer.vue';
import AudioControls from '@renderer/components/audio/AudioControls.vue';
import AudioProgressBar from '@renderer/components/audio/AudioProgressBar.vue';
import AudioLayoutToggle from '@renderer/components/audio/AudioLayoutToggle.vue';
import AudioCover from '@renderer/components/audio/AudioCover.vue';
import AudioTrackInfo from '@renderer/components/audio/AudioTrackInfo.vue';
import AudioVizSettings from '@renderer/components/audio/AudioVizSettings.vue';

const player = usePlayerStore();
const audio = useAudioPlayer();
const audioPip = useAudioPiP();

const layoutMode = ref<'split' | 'full' | 'stacked'>('split');
const splitRatio = ref(50);
const showUI = ref(true);
const uiTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
const vizRef = ref<InstanceType<typeof AudioVisualizer> | null>(null);
const showVizSettings = ref(false);

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

function onSplitDividerMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.classList.contains('split-divider')) return;
  e.preventDefault();
  const startX = e.clientX;
  const startRatio = splitRatio.value;
  const parent = target.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  function onMove(ev: MouseEvent) {
    splitRatio.value = Math.max(
      20,
      Math.min(80, startRatio + ((ev.clientX - startX) / rect.width) * 100)
    );
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
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

    <!-- AUDIO PIP TOGGLE — top-right -->
    <div
      class="absolute top-4 right-4 z-30 transition-opacity"
      :class="{ 'opacity-0': !showUI, 'opacity-100': showUI }"
    >
      <button
        class="p-2 rounded-lg bg-bg-overlay/80 backdrop-blur-sm transition-all"
        :class="
          audioPip.isActive.value
            ? 'text-accent-base bg-accent-ghost'
            : 'text-fg-faint hover:text-fg-base hover:bg-bg-hover'
        "
        :title="$t('audioView.pip')"
        :aria-label="$t('audioView.pip')"
        @click="audioPip.toggle()"
      >
        <PictureInPicture2 :size="15" />
      </button>
    </div>

    <!-- ═══════ FULL layout — visualizer as background ═══════ -->
    <div v-if="layoutMode === 'full'" class="h-full w-full relative overflow-hidden">
      <div class="absolute inset-0 opacity-60">
        <AudioVisualizer ref="vizRef" />
      </div>
      <div class="absolute inset-0 bg-linear-to-t from-bg-base/90 via-bg-base/40 to-bg-base/60" />
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

      <!-- viz controls — bottom-left -->
      <div class="absolute bottom-4 left-4 z-20 flex items-center gap-1">
        <button
          class="p-2 rounded-lg bg-bg-overlay/80 backdrop-blur-sm text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-all"
          :class="{ 'opacity-60': showUI }"
          :title="$t('audioView.vizMode')"
          @click="vizRef?.cycleStyle()"
        >
          <div class="flex items-center gap-1.5">
            <BarChart3 :size="14" />
            <span class="text-[10px] uppercase font-medium">{{ vizRef?.style ?? 'bars' }}</span>
          </div>
        </button>
        <button
          class="p-2 rounded-lg bg-bg-overlay/80 backdrop-blur-sm transition-all"
          :class="
            showVizSettings
              ? 'text-accent-base bg-accent-ghost'
              : 'text-fg-faint hover:text-fg-base hover:bg-bg-hover'
          "
          :title="$t('settings.audioViz')"
          @click="showVizSettings = !showVizSettings"
        >
          <Settings2 :size="14" />
        </button>
      </div>
      <div v-if="showVizSettings" class="absolute bottom-16 left-4 z-20">
        <AudioVizSettings />
      </div>
    </div>

    <!-- ═══════ SPLIT layout — cover left, visualizer right ═══════ -->
    <div
      v-else-if="layoutMode === 'split'"
      class="h-full w-full flex overflow-hidden"
      @mousedown="onSplitDividerMouseDown"
    >
      <div
        class="flex flex-col items-center justify-center px-8 min-w-0 overflow-auto"
        :style="{ width: splitRatio + '%' }"
      >
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
      <div class="split-divider w-1 shrink-0 cursor-col-resize" />
      <div class="h-full p-4 pl-0 relative" :style="{ width: 100 - splitRatio + '%' }">
        <AudioVisualizer class="h-full" />
        <div class="absolute top-2 right-2 z-10 flex gap-1">
          <button
            class="p-1.5 rounded-lg bg-bg-overlay/80 backdrop-blur-sm text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-all text-[10px]"
            :title="$t('audioView.vizMode')"
            @click="vizRef?.cycleStyle()"
          >
            <div class="flex items-center gap-1">
              <BarChart3 :size="12" />
              <span class="uppercase font-medium">{{ vizRef?.style ?? 'bars' }}</span>
            </div>
          </button>
          <button
            class="p-1.5 rounded-lg bg-bg-overlay/80 backdrop-blur-sm transition-all"
            :class="
              showVizSettings
                ? 'text-accent-base bg-accent-ghost'
                : 'text-fg-faint hover:text-fg-base hover:bg-bg-hover'
            "
            :title="$t('settings.audioViz')"
            @click="showVizSettings = !showVizSettings"
          >
            <Settings2 :size="12" />
          </button>
        </div>
        <div v-if="showVizSettings" class="absolute top-10 right-2 z-10">
          <AudioVizSettings />
        </div>
      </div>
    </div>

    <!-- ═══════ STACKED layout — compact vertical stack ═══════ -->
    <div v-else class="h-full w-full flex flex-col overflow-hidden">
      <div class="flex-1 flex flex-col items-center justify-center px-6 py-4 overflow-auto">
        <AudioCover size="w-48 h-48 shadow-xl shadow-black/30" class="mb-3 shrink-0" />
        <div class="text-center mb-2 max-w-xs">
          <AudioTrackInfo title-size="text-base" />
        </div>
        <div
          class="w-full max-w-xs mb-2 transition-opacity shrink-0"
          :class="{ 'opacity-0': !showUI, 'opacity-100': showUI }"
        >
          <AudioProgressBar />
        </div>
        <div
          class="transition-opacity shrink-0"
          :class="{ 'opacity-0': !showUI, 'opacity-100': showUI }"
        >
          <AudioControls />
        </div>
      </div>
      <div class="h-32 shrink-0 relative border-t border-border-default">
        <AudioVisualizer class="h-full" />
        <div class="absolute top-1 right-1 z-10 flex gap-1">
          <button
            class="p-1 rounded-lg bg-bg-overlay/80 backdrop-blur-sm text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-all text-[9px]"
            :title="$t('audioView.vizMode')"
            @click="vizRef?.cycleStyle()"
          >
            <div class="flex items-center gap-1">
              <BarChart3 :size="10" />
              <span class="uppercase font-medium">{{ vizRef?.style ?? 'bars' }}</span>
            </div>
          </button>
          <button
            class="p-1 rounded-lg bg-bg-overlay/80 backdrop-blur-sm transition-all"
            :class="
              showVizSettings
                ? 'text-accent-base bg-accent-ghost'
                : 'text-fg-faint hover:text-fg-base hover:bg-bg-hover'
            "
            :title="$t('settings.audioViz')"
            @click="showVizSettings = !showVizSettings"
          >
            <Settings2 :size="10" />
          </button>
        </div>
        <div v-if="showVizSettings" class="absolute bottom-10 right-1 z-10">
          <AudioVizSettings />
        </div>
      </div>
    </div>
  </div>
</template>
