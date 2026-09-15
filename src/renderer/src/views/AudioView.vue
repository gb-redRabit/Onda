<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from 'vue';
import { Music2 } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { usePluginsStore } from '@renderer/stores/plugins';
import AudioCanvasElements from '@renderer/components/audio/AudioCanvasElements.vue';
import AudioHudToolbar from '@renderer/components/audio/AudioHudToolbar.vue';
import AudioVizSettings from '@renderer/components/audio/AudioVizSettings.vue';
import { nextVizMode } from '@renderer/utils/audioVisualizer';
import { useAudioElementDrag } from '@renderer/composables/useAudioElementDrag';
import { useAudioImmersive } from '@renderer/composables/useAudioImmersive';

// The layout editor (750+ lines) only renders when the user opens it — lazy.
const AudioLayoutEditor = defineAsyncComponent(
  () => import('@renderer/components/audio/AudioLayoutEditor.vue')
);

const player = usePlayerStore();
const settings = useSettingsStore();
const pluginsStore = usePluginsStore();

function cycleViz() {
  settings.updatePlayback({
    visualization: {
      ...settings.playback.visualization,
      mode: nextVizMode(settings.playback.visualization.mode)
    }
  });
}

const pluginCommands = computed(() => pluginsStore.commandsIn('audio-view'));

const showVizSettings = ref(false);
const showLayoutEditor = ref(false);
const { setViewEl, showUI, isFullscreen, onMouseMove, toggleFullscreen } = useAudioImmersive({
  isDragging: () => !!dragging.value,
  onDragMove: (e) => onDragMouseMove(e),
  showLayoutEditor
});

// Drag state
const { dragging, dragPos, onElementMouseDown, onDragMouseMove, onDragMouseUp } =
  useAudioElementDrag(isFullscreen);

const elements = computed(() => settings.appearance.audioLayout?.elements ?? []);
const hudOpacity = computed(() => (settings.appearance.audioLayout?.hudOpacity ?? 100) / 100);

// Cursor + HUD hide together — the delay comes from Odtwarzanie (playback) settings.
</script>

<template>
  <div
    :ref="setViewEl"
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
    <AudioCanvasElements
      :elements="elements"
      :drag-pos="dragPos"
      :is-fullscreen="isFullscreen"
      :ui-visible="showUI"
      @element-mousedown="onElementMouseDown"
    />

    <!-- ─── Viz Overlay Toolbar (Teleported out of viz stacking context) ─── -->
    <AudioHudToolbar
      v-model:layout-editor-open="showLayoutEditor"
      v-model:viz-settings-open="showVizSettings"
      :visible="showUI"
      :hud-opacity="hudOpacity"
      :is-fullscreen="isFullscreen"
      :viz-mode="settings.playback.visualization.mode"
      :commands="pluginCommands"
      @cycle-viz="cycleViz"
      @toggle-fullscreen="toggleFullscreen"
      @run-command="pluginsStore.dispatchCommand($event)"
    />

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
