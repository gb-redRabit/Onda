<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from 'vue';
import { Music2 } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { usePluginsStore } from '@renderer/stores/plugins';
import { audioEngine } from '@renderer/modules/audioEngine';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { isCoreShell } from '@renderer/utils/runtimeMode';
import ResumePrompt from '@renderer/components/player/ResumePrompt.vue';
import AudioCanvasElements from '@renderer/components/audio/AudioCanvasElements.vue';
import PluginUiSlot from '@renderer/components/explorer/plugins/PluginUiSlot.vue';
import AudioHudToolbar from '@renderer/components/audio/AudioHudToolbar.vue';
import AudioVizSettings from '@renderer/components/audio/AudioVizSettings.vue';
import PageHeader from '@renderer/components/ui/PageHeader.vue';
import { nextVizMode } from '@renderer/utils/audioVisualizer';
import { useAudioElementDrag } from '@renderer/composables/useAudioElementDrag';
import { useAudioImmersive } from '@renderer/composables/useAudioImmersive';
import { useDialogFocus } from '@renderer/composables/useDialogFocus';
import { useResumePrompt } from '@renderer/composables/useResumePrompt';
import { useAlwaysOnTop } from '@renderer/composables/useAlwaysOnTop';

// Edytor układu (750+ linii) renderuje się dopiero, gdy użytkownik go otworzy — leniwie.
const AudioLayoutEditor = defineAsyncComponent(
  () => import('@renderer/components/audio/AudioLayoutEditor.vue')
);

const player = usePlayerStore();
const settings = useSettingsStore();
const pluginsStore = usePluginsStore();
const { pinned, togglePin } = useAlwaysOnTop();

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
// Nakładka edytora układu jest modalna: pułapka focusu + powrót fokusu (WCAG 2.4.3).
const layoutEditorRef = ref<HTMLElement | null>(null);
useDialogFocus(layoutEditorRef, {
  closeOnEscape: true,
  onEscape: () => {
    showLayoutEditor.value = false;
  }
});
const { setViewEl, showUI, isFullscreen, onMouseMove, toggleFullscreen } = useAudioImmersive({
  isDragging: () => !!dragging.value,
  onDragMove: (e) => onDragMouseMove(e),
  showLayoutEditor,
  // Panel ustawień wizualizacji trzyma HUD: dopóki jest otwarty, przyciski (w tym
  // jego własny przełącznik) pozostają widoczne i klikalne.
  holdUI: () => showVizSettings.value
});

// Stan przeciągania
const { dragging, dragPos, onElementMouseDown, onDragMouseMove, onDragMouseUp, onElementKeydown } =
  useAudioElementDrag(isFullscreen);

const elements = computed(() => settings.appearance.audioLayout?.elements ?? []);
const hudOpacity = computed(() => (settings.appearance.audioLayout?.hudOpacity ?? 100) / 100);

const {
  pause: pauseResumePrompt,
  resume: resumeResumePrompt,
  onContinue: onResumeContinue,
  onStart: onResumeStart
} = useResumePrompt({
  onContinue: (prompt) => {
    useAudioPlayer().seek(prompt.position);
    player.currentTime = prompt.position;
    useAudioPlayer().play();
    window.api?.setPlaybackPosition(prompt.path, prompt.position);
  },
  onStart: (prompt) => {
    window.api?.clearPlaybackPosition(prompt.path);
    if (!isCoreShell()) audioEngine.clearSavedPosition(prompt.path);
  }
});

// Kursor i HUD ukrywają się razem — opóźnienie pochodzi z ustawień Odtwarzania.
</script>

<template>
  <div
    :ref="setViewEl"
    data-testid="audio-view"
    class="relative h-full w-full bg-base-200/(--glass-alpha) select-none"
    @mousemove="onMouseMove"
    @mouseup="onDragMouseUp"
  >
    <!-- ─── Stan pusty (brak utworu) ─── -->
    <div
      v-if="!player.currentTrack"
      data-testid="audio-empty"
      class="absolute inset-0 z-95 flex flex-col items-center justify-center gap-3 pointer-events-none"
    >
      <Music2 :size="48" class="text-base-content/15" aria-hidden="true" />
      <div class="text-center">
        <p class="text-base-content/50 text-sm font-medium">{{ $t('audioView.noTrackTitle') }}</p>
        <p class="text-base-content/55 text-2xs">{{ $t('audioView.noTrackHint') }}</p>
      </div>
    </div>

    <!-- ─── Edytor układu (nakładka) ─── -->
    <div
      v-if="showLayoutEditor"
      ref="layoutEditorRef"
      role="dialog"
      aria-modal="true"
      :aria-label="$t('audioView.layoutEditor')"
      tabindex="-1"
      class="absolute inset-0 z-90 bg-base-100/95 backdrop-blur-sm p-6 flex flex-col outline-hidden"
    >
      <PageHeader
        :title="$t('audioView.layoutEditor')"
        compact
        class="mb-4 rounded-box border border-base-300"
      >
        <template #actions>
          <button
            class="fx-noise rounded-field bg-primary px-3 py-1.5 text-xs font-medium text-primary-content fx-depth transition-colors hover:bg-primary/90"
            @click="showLayoutEditor = false"
          >
            {{ $t('audioView.layoutDone') }}
          </button>
        </template>
      </PageHeader>
      <div class="flex-1 min-h-0">
        <AudioLayoutEditor />
      </div>
    </div>

    <!-- ─── Wolne płótno ─── -->
    <AudioCanvasElements
      :elements="elements"
      :drag-pos="dragPos"
      :is-fullscreen="isFullscreen"
      :ui-visible="showUI"
      @element-mousedown="onElementMouseDown"
      @element-keydown="onElementKeydown"
    />

    <!-- ─── Slot UI pluginu (renderowany przez host, czysty tekst) ─── -->
    <PluginUiSlot slot-id="audio-view" :visible="showUI && !showLayoutEditor" />

    <!-- ─── Pasek narzędzi nakładki wizualizacji (teleportowany poza kontekst stackowania wiz.) ─── -->
    <AudioHudToolbar
      v-model:layout-editor-open="showLayoutEditor"
      v-model:viz-settings-open="showVizSettings"
      :visible="showUI"
      :hud-opacity="hudOpacity"
      :is-fullscreen="isFullscreen"
      :viz-mode="settings.playback.visualization.mode"
      :commands="pluginCommands"
      :pinned="pinned"
      @cycle-viz="cycleViz"
      @toggle-fullscreen="toggleFullscreen"
      @toggle-pin="togglePin"
      @run-command="pluginsStore.dispatchCommand($event)"
    />

    <!-- ─── Panel ustawień wizualizacji ─── -->
    <!-- Renderowany wewnątrz widoku (nie teleportowany do body): dzięki temu jest
         widoczny w pełnym ekranie (element fullscreen nie wyświetla treści poza
         sobą) i nie „przeskakuje" nad przycisk go otwierający — panel i pasek HUD
         używają tego samego układu współrzędnych. -->
    <div
      v-if="showVizSettings && !showLayoutEditor"
      class="absolute top-12 right-4 z-80 transition-opacity"
      :class="{ 'opacity-0 pointer-events-none': !showUI, 'opacity-100': showUI }"
    >
      <AudioVizSettings />
    </div>

    <ResumePrompt
      v-if="player.resumePrompt"
      :position="player.resumePrompt.position"
      @continue="onResumeContinue"
      @start="onResumeStart"
      @pause="pauseResumePrompt"
      @resume="resumeResumePrompt"
    />
  </div>
</template>

<style scoped>
.hide-cursor,
.hide-cursor * {
  cursor: none !important;
}
</style>
