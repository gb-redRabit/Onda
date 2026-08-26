<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { BarChart3, Settings2, LayoutGrid, Maximize2, Minimize2, Music2 } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { useSettingsStore } from '@renderer/stores/settings';
import AudioVisualizer from '@renderer/components/audio/AudioVisualizer.vue';
import AudioControls from '@renderer/components/audio/AudioControls.vue';
import AudioProgressBar from '@renderer/components/audio/AudioProgressBar.vue';
import AudioCover from '@renderer/components/audio/AudioCover.vue';
import AudioTrackInfo from '@renderer/components/audio/AudioTrackInfo.vue';
import AudioVizSettings from '@renderer/components/audio/AudioVizSettings.vue';
import AudioLayoutEditor from '@renderer/components/audio/AudioLayoutEditor.vue';
import AudioLayoutSwitcher from '@renderer/components/audio/AudioLayoutSwitcher.vue';
import type { AudioLayoutElement } from '@renderer/types/settings';

const player = usePlayerStore();
const audio = useAudioPlayer();
const settings = useSettingsStore();

const viewEl = ref<HTMLElement | null>(null);
const showUI = ref(true);
const uiTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
const vizRef = ref<InstanceType<typeof AudioVisualizer>[]>([]);
const showVizSettings = ref(false);
const showLayoutEditor = ref(false);
const isFullscreen = ref(false);

// Drag state
const dragging = ref<{ id: string; startX: number; startY: number; elX: number; elY: number } | null>(null);

const elements = computed(() => settings.appearance.audioLayout?.elements ?? []);
const autoHideDelay = computed(() => settings.appearance.audioLayout?.autoHideDelay ?? 3000);
const hudOpacity = computed(() => (settings.appearance.audioLayout?.hudOpacity ?? 100) / 100);

function getElementStyle(el: AudioLayoutElement) {
  return {
    left: el.x + '%',
    top: el.y + '%',
    width: el.width + '%',
    height: el.height + '%',
    opacity: (el.opacity ?? 100) / 100,
    zIndex: el.layer * 10
  };
}

function onElementMouseDown(e: MouseEvent, el: AudioLayoutElement) {
  if (!isFullscreen.value || el.id === 'visualization') return;
  e.preventDefault();
  e.stopPropagation();
  dragging.value = {
    id: el.id,
    startX: e.clientX,
    startY: e.clientY,
    elX: el.x,
    elY: el.y
  };
}

function onDragMouseMove(e: MouseEvent) {
  if (!dragging.value) return;
  const canvas = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const dx = ((e.clientX - dragging.value.startX) / canvas.width) * 100;
  const dy = ((e.clientY - dragging.value.startY) / canvas.height) * 100;
  const newX = Math.max(0, Math.min(100 - 5, dragging.value.elX + dx));
  const newY = Math.max(0, Math.min(100 - 5, dragging.value.elY + dy));

  const currentElements = settings.appearance.audioLayout?.elements ?? [];
  const updated = currentElements.map((el) =>
    el.id === dragging.value!.id ? { ...el, x: Math.round(newX), y: Math.round(newY) } : el
  );
  settings.updateAppearance({
    audioLayout: { ...settings.appearance.audioLayout, elements: updated }
  });
}

function onDragMouseUp() {
  dragging.value = null;
}

function hideUIAfterDelay() {
  if (uiTimeout.value) clearTimeout(uiTimeout.value);
  uiTimeout.value = setTimeout(() => {
    if (audio.isPlaying.value) showUI.value = false;
  }, autoHideDelay.value);
}

function onMouseMove(e: MouseEvent) {
  if (dragging.value) onDragMouseMove(e);
  if (isFullscreen.value) {
    showUI.value = true;
    hideUIAfterDelay();
    return;
  }
  showUI.value = true;
  hideUIAfterDelay();
}

function toggleFullscreen() {
  if (!viewEl.value) return;
  if (!isFullscreen.value) {
    viewEl.value.requestFullscreen().then(() => {
      isFullscreen.value = true;
      showUI.value = false;
      hideUIAfterDelay();
    }).catch(() => {});
  } else {
    document.exitFullscreen().then(() => {
      isFullscreen.value = false;
      showUI.value = true;
    }).catch(() => {});
  }
}

function onFullscreenChange() {
  if (!document.fullscreenElement && isFullscreen.value) {
    isFullscreen.value = false;
    showUI.value = true;
  }
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
    case 'F11':
    case 'Escape':
      if (isFullscreen.value) {
        e.preventDefault();
        toggleFullscreen();
      }
      break;
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  hideUIAfterDelay();
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  if (uiTimeout.value) clearTimeout(uiTimeout.value);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
});
</script>

<template>
  <div ref="viewEl" class="h-full w-full bg-base-200/(--glass-alpha) select-none" @mousemove="onMouseMove" @mouseup="onDragMouseUp">
    <!-- ─── Empty State (no track) ─── -->
    <div
      v-if="!player.currentTrack"
      class="absolute inset-0 z-95 flex flex-col items-center justify-center gap-3 pointer-events-none"
    >
      <Music2 :size="48" class="text-base-content/15" />
      <div class="text-center">
        <p class="text-base-content/50 text-sm font-medium">{{ $t('audioView.noTrackTitle') }}</p>
        <p class="text-base-content/30 text-[11px]">{{ $t('audioView.noTrackHint') }}</p>
      </div>
    </div>

    <!-- ─── Layout Editor (overlay) ─── -->
    <div
      v-if="showLayoutEditor"
      class="absolute inset-0 z-90 bg-base-100/95 backdrop-blur-sm p-6 flex flex-col"
    >
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-bold">{{ $t('audioView.layoutEditor') }}</h2>
        <button
          class="px-3 py-1.5 rounded-field text-xs font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors"
          @click="showLayoutEditor = false"
        >
          {{ $t('audioView.layoutDone') }}
        </button>
      </div>
      <div class="flex-1 min-h-0">
        <AudioLayoutEditor />
      </div>
    </div>

    <!-- ─── Free Canvas ─── -->
    <div
      v-for="el in elements"
      v-show="el.visible"
      :key="el.id"
      class="absolute overflow-hidden"
      :style="getElementStyle(el)"
    >
      <!-- Visualization (with built-in toolbar) -->
      <template v-if="el.id === 'visualization'">
        <div class="relative w-full h-full">
          <AudioVisualizer ref="vizRef" class="w-full h-full" />
        </div>
      </template>

      <!-- Cover -->
      <template v-else-if="el.id === 'cover'">
        <div
          class="w-full h-full flex items-center justify-center p-2"
          @mousedown="onElementMouseDown($event, el)"
        >
          <AudioCover size="w-full h-full" />
        </div>
      </template>

      <!-- Track Info -->
      <template v-else-if="el.id === 'trackInfo'">
        <div
          class="w-full h-full flex items-center justify-center px-4 transition-opacity"
          :class="{ 'opacity-0 pointer-events-none': isFullscreen && !showUI }"
          @mousedown="onElementMouseDown($event, el)"
        >
          <AudioTrackInfo />
        </div>
      </template>

      <!-- Progress -->
      <template v-else-if="el.id === 'progress'">
        <div
          class="w-full h-full flex items-center px-4 transition-opacity"
          :class="{
            'opacity-0 pointer-events-none': !showUI || (isFullscreen && !showUI)
          }"
          @mousedown="onElementMouseDown($event, el)"
        >
          <AudioProgressBar />
        </div>
      </template>

      <!-- Controls -->
      <template v-else-if="el.id === 'controls'">
        <div
          class="w-full h-full flex items-center justify-center transition-opacity"
          :class="{
            'opacity-0 pointer-events-none': !showUI || (isFullscreen && !showUI)
          }"
          @mousedown="onElementMouseDown($event, el)"
        >
          <AudioControls />
        </div>
      </template>
    </div>

    <!-- ─── Viz Overlay Toolbar (Teleported out of viz stacking context) ─── -->
    <div
      v-show="!showLayoutEditor"
      class="absolute top-2 left-2 right-2 z-70 flex items-center justify-between pointer-events-none transition-opacity"
      :class="{ 'opacity-0': !showUI, 'opacity-100': showUI }"
      :style="{ opacity: showUI ? hudOpacity : 0 }"
    >
      <div class="flex items-center gap-1 pointer-events-auto">
        <button
          class="pointer-events-auto fx-noise p-1.5 fx-depth rounded-field bg-base-300/80 backdrop-blur-sm text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-all"
          :title="$t('audioView.layoutEditor')"
          @click.stop="showLayoutEditor = !showLayoutEditor"
        >
          <LayoutGrid :size="13" />
        </button>
        <AudioLayoutSwitcher />
      </div>

      <div class="flex items-center gap-1 pointer-events-auto">
        <button
          class="fx-noise p-1.5 fx-depth rounded-field bg-base-300/80 backdrop-blur-sm text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-all"
          :title="$t('audioView.vizMode')"
          @click.stop="vizRef?.[0]?.cycleStyle()"
        >
          <div class="flex items-center gap-1">
            <BarChart3 :size="12" />
            <span class="text-[9px] uppercase font-medium">{{ vizRef?.[0]?.style ?? 'bars' }}</span>
          </div>
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field backdrop-blur-sm transition-all"
          :class="
            showVizSettings
              ? 'text-primary bg-primary/10'
              : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10 bg-base-300/80'
          "
          :title="$t('settings.audioViz')"
          @click.stop="showVizSettings = !showVizSettings"
        >
          <Settings2 :size="12" />
        </button>
        <button
          class="fx-noise p-1.5 fx-depth rounded-field bg-base-300/80 backdrop-blur-sm text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-all"
          :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
          @click.stop="toggleFullscreen"
        >
          <Minimize2 v-if="isFullscreen" :size="12" />
          <Maximize2 v-else :size="12" />
        </button>
      </div>
    </div>

    <!-- ─── Viz Settings Panel (Teleported out of viz stacking context) ─── -->
    <Teleport to="body">
      <div
        v-if="showVizSettings && !showLayoutEditor"
        class="fixed top-12 right-4 z-80 transition-opacity"
        :class="{ 'opacity-0 pointer-events-none': !showUI, 'opacity-100': showUI }"
      >
        <AudioVizSettings />
      </div>
    </Teleport>
  </div>
</template>
