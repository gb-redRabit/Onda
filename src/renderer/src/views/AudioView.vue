<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, defineAsyncComponent } from 'vue';
import { BarChart3, Settings2, LayoutGrid, Maximize2, Minimize2, Music2 } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { useSettingsStore } from '@renderer/stores/settings';
import { usePluginsStore } from '@renderer/stores/plugins';
import AudioVisualizer from '@renderer/components/audio/AudioVisualizer.vue';
import AudioControls from '@renderer/components/audio/AudioControls.vue';
import AudioProgressBar from '@renderer/components/audio/AudioProgressBar.vue';
import AudioCover from '@renderer/components/audio/AudioCover.vue';
import AudioTrackInfo from '@renderer/components/audio/AudioTrackInfo.vue';
import AudioVizSettings from '@renderer/components/audio/AudioVizSettings.vue';
import AudioLayoutSwitcher from '@renderer/components/audio/AudioLayoutSwitcher.vue';
import type { AudioLayoutElement } from '@renderer/types/settings';
import {
  pluginIcon,
  resolveDecorationClasses,
  resolveElementDecoration
} from '@renderer/utils/audioView';
import { nextVizMode } from '@renderer/utils/audioVisualizer';
import { useAudioElementDrag } from '@renderer/composables/useAudioElementDrag';
import { elementStyle } from '@renderer/utils/audioElementStyle';

// The layout editor (750+ lines) only renders when the user opens it — lazy.
const AudioLayoutEditor = defineAsyncComponent(
  () => import('@renderer/components/audio/AudioLayoutEditor.vue')
);

const player = usePlayerStore();
const audio = useAudioPlayer();
const settings = useSettingsStore();
const pluginsStore = usePluginsStore();

function elementDecoration(el: AudioLayoutElement): string | undefined {
  return resolveElementDecoration(el, pluginsStore.decorations);
}

function decorationClasses(el: AudioLayoutElement): string | undefined {
  return resolveDecorationClasses(el, pluginsStore.decorations);
}

function cycleViz() {
  settings.updatePlayback({
    visualization: {
      ...settings.playback.visualization,
      mode: nextVizMode(settings.playback.visualization.mode)
    }
  });
}

const pluginCommands = computed(() => pluginsStore.commandsIn('audio-view'));

const viewEl = ref<HTMLElement | null>(null);
const showUI = ref(true);
const uiTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
const uiFireAt = ref(0);
const showVizSettings = ref(false);
const showLayoutEditor = ref(false);
const isFullscreen = ref(false);

// Drag state
const { dragging, dragPos, onElementMouseDown, onDragMouseMove, onDragMouseUp } =
  useAudioElementDrag(isFullscreen);

const elements = computed(() => settings.appearance.audioLayout?.elements ?? []);
const cursorHideTimeout = computed(() => (settings.playback.cursorTimeout ?? 3) * 1000);
const hudOpacity = computed(() => (settings.appearance.audioLayout?.hudOpacity ?? 100) / 100);

function getElementStyle(el: AudioLayoutElement) {
  return elementStyle(el, dragPos.value);
}

// Cursor + HUD hide together — the delay comes from Odtwarzanie (playback) settings.
function setCursorVisible(visible: boolean) {
  if (!viewEl.value) return;
  viewEl.value.classList.toggle('hide-cursor', !visible);
}

function hideUIAfterDelay() {
  const now = Date.now();
  const delay = cursorHideTimeout.value;
  if (uiTimeout.value) {
    if (uiFireAt.value - now > delay / 3) return;
    clearTimeout(uiTimeout.value);
  }
  uiFireAt.value = now + delay;
  uiTimeout.value = setTimeout(() => {
    uiTimeout.value = null;
    if (audio.isPlaying.value && settings.playback.cursorHide) {
      showUI.value = false;
      setCursorVisible(false);
    }
  }, delay);
}

function onMouseMove(e: MouseEvent) {
  if (dragging.value) onDragMouseMove(e);
  showUI.value = true;
  setCursorVisible(true);
  hideUIAfterDelay();
}

function toggleFullscreen() {
  if (!viewEl.value) return;
  if (!isFullscreen.value) {
    viewEl.value
      .requestFullscreen()
      .then(() => {
        isFullscreen.value = true;
        setCursorVisible(true);
        showUI.value = false;
        hideUIAfterDelay();
      })
      .catch(() => {});
  } else {
    document
      .exitFullscreen()
      .then(() => {
        isFullscreen.value = false;
        showUI.value = true;
        setCursorVisible(true);
      })
      .catch(() => {});
  }
}

function onFullscreenChange() {
  if (!document.fullscreenElement && isFullscreen.value) {
    isFullscreen.value = false;
    showUI.value = true;
    setCursorVisible(true);
  }
}

watch(
  () => audio.isPlaying.value,
  (playing) => {
    if (playing) {
      hideUIAfterDelay();
    } else {
      showUI.value = true;
      setCursorVisible(true);
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
  if (
    target.closest('button') ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  )
    return;
  // Edytor layoutu przejmuje klawisze strzałek.
  if (showLayoutEditor.value) return;
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
  <div
    ref="viewEl"
    class="h-full w-full bg-base-200/(--glass-alpha) select-none"
    @mousemove="onMouseMove"
    @mouseup="onDragMouseUp"
  >
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
          class="px-3 py-1.5 rounded-field text-xs font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors fx-depth fx-noise"
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
        <div class="relative w-full h-full" :class="decorationClasses(el)">
          <AudioVisualizer class="w-full h-full" />
        </div>
      </template>

      <!-- Cover -->
      <template v-else-if="el.id === 'cover'">
        <div
          class="w-full h-full flex items-center justify-center p-2"
          @mousedown="onElementMouseDown($event, el)"
        >
          <AudioCover
            size="w-full h-full"
            :variant="el.variant ?? 'default'"
            :decoration="elementDecoration(el)"
          />
        </div>
      </template>

      <!-- Track Info -->
      <template v-else-if="el.id === 'trackInfo'">
        <div
          class="w-full h-full flex items-center justify-center px-4 transition-opacity"
          :class="[
            { 'opacity-0 pointer-events-none': isFullscreen && !showUI },
            decorationClasses(el)
          ]"
          @mousedown="onElementMouseDown($event, el)"
        >
          <AudioTrackInfo :variant="el.variant ?? 'classic'" />
        </div>
      </template>

      <!-- Progress -->
      <template v-else-if="el.id === 'progress'">
        <div
          class="w-full h-full flex items-center px-4 transition-opacity"
          :class="[
            { 'opacity-0 pointer-events-none': !showUI || (isFullscreen && !showUI) },
            decorationClasses(el)
          ]"
          @mousedown="onElementMouseDown($event, el)"
        >
          <AudioProgressBar :variant="el.variant ?? 'classic'" />
        </div>
      </template>

      <!-- Controls -->
      <template v-else-if="el.id === 'controls'">
        <div
          class="w-full h-full flex items-center justify-center transition-opacity"
          :class="[
            { 'opacity-0 pointer-events-none': !showUI || (isFullscreen && !showUI) },
            decorationClasses(el)
          ]"
          @mousedown="onElementMouseDown($event, el)"
        >
          <AudioControls :variant="el.variant ?? 'standard'" />
        </div>
      </template>
    </div>

    <!-- ─── Viz Overlay Toolbar (Teleported out of viz stacking context) ─── -->
    <div
      v-show="!showLayoutEditor"
      class="absolute top-2 left-2 right-2 z-70 flex items-center justify-between pointer-events-none transition-opacity"
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

      <!-- Plugin toolbar buttons -->
      <div v-if="pluginCommands.length" class="flex items-center gap-1 pointer-events-auto">
        <button
          v-for="cmd in pluginCommands"
          :key="cmd.id"
          class="fx-noise p-1.5 fx-depth rounded-field bg-base-300/80 backdrop-blur-sm text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-all"
          :title="cmd.label"
          @click.stop="pluginsStore.dispatchCommand(cmd.id)"
        >
          <component :is="pluginIcon(cmd.icon)" :size="13" />
        </button>
      </div>

      <div class="flex items-center gap-1 pointer-events-auto">
        <button
          class="fx-noise p-1.5 fx-depth rounded-field bg-base-300/80 backdrop-blur-sm text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-all"
          :title="$t('audioView.vizMode')"
          @click.stop="cycleViz()"
        >
          <div class="flex items-center gap-1">
            <BarChart3 :size="12" />
            <span class="text-[9px] uppercase font-medium">{{
              settings.playback.visualization.mode || 'bars'
            }}</span>
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

<style scoped>
.hide-cursor,
.hide-cursor * {
  cursor: none !important;
}
</style>
