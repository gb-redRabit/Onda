<script setup lang="ts">
import AudioVisualizer from './AudioVisualizer.vue';
import AudioCover from './AudioCover.vue';
import TrackInfo from '../TrackInfo.vue';
import AudioProgressBar from './AudioProgressBar.vue';
import AudioControls from './AudioControls.vue';
import { usePluginsStore } from '@renderer/stores/plugins';
import { usePlayerStore } from '@renderer/stores/player';
import { resolveElementDecoration } from '@renderer/utils/audioView';
import { elementStyle } from '@renderer/utils/audioElementStyle';
import type { AudioLayoutElement } from '@renderer/types/settings';

// Renderer elementów free-canvas wyodrębniony z AudioView (kontynuacja planu 6.3).
// Stan przeciągania zostaje w widoku/composable; ten komponent tylko renderuje i
// przekazuje mousedown przeciągania.

const props = defineProps<{
  elements: AudioLayoutElement[];
  dragPos: { id: string; x: number; y: number } | null;
  isFullscreen: boolean;
  uiVisible: boolean;
}>();

const emit = defineEmits<{
  'element-mousedown': [event: MouseEvent, el: AudioLayoutElement];
}>();

const pluginsStore = usePluginsStore();
const player = usePlayerStore();

function elementDecoration(el: AudioLayoutElement): string | undefined {
  return resolveElementDecoration(el, pluginsStore.decorations);
}

function styleFor(el: AudioLayoutElement) {
  return elementStyle(el, props.dragPos);
}
</script>

<template>
  <div
    v-for="el in props.elements"
    v-show="el.visible"
    :key="el.id"
    class="absolute overflow-hidden"
    :style="styleFor(el)"
  >
    <!-- Wizualizacja (z wbudowanym paskiem narzędzi) -->
    <template v-if="el.id === 'visualization'">
      <div class="relative w-full h-full">
        <AudioVisualizer class="w-full h-full" />
      </div>
    </template>

    <!-- Okładka -->
    <template v-else-if="el.id === 'cover'">
      <div
        class="w-full h-full flex items-center justify-center p-2"
        @mousedown="emit('element-mousedown', $event, el)"
      >
        <AudioCover
          size="w-full h-full"
          :variant="el.variant ?? 'default'"
          :decoration="elementDecoration(el)"
        />
      </div>
    </template>

    <!-- Informacje o utworze -->
    <template v-else-if="el.id === 'trackInfo'">
      <div
        class="w-full h-full flex items-center justify-center px-4 transition-opacity"
        :class="{ 'opacity-0 pointer-events-none': props.isFullscreen && !props.uiVisible }"
        @mousedown="emit('element-mousedown', $event, el)"
      >
        <TrackInfo
          :track="player.currentTrack"
          variant="audio"
          :audio-variant="el.variant ?? 'classic'"
          show-favorite
        />
      </div>
    </template>

    <!-- Postęp -->
    <template v-else-if="el.id === 'progress'">
      <div
        class="w-full h-full flex items-center px-4 transition-opacity"
        :class="{
          'opacity-0 pointer-events-none':
            !props.uiVisible || (props.isFullscreen && !props.uiVisible)
        }"
        @mousedown="emit('element-mousedown', $event, el)"
      >
        <AudioProgressBar :variant="el.variant ?? 'classic'" />
      </div>
    </template>

    <!-- Kontrolki -->
    <template v-else-if="el.id === 'controls'">
      <div
        class="w-full h-full flex items-center justify-center transition-opacity"
        :class="{
          'opacity-0 pointer-events-none':
            !props.uiVisible || (props.isFullscreen && !props.uiVisible)
        }"
        @mousedown="emit('element-mousedown', $event, el)"
      >
        <AudioControls :variant="el.variant ?? 'standard'" />
      </div>
    </template>
  </div>
</template>
