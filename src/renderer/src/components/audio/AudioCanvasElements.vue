<script setup lang="ts">
import AudioVisualizer from './AudioVisualizer.vue';
import AudioCover from './AudioCover.vue';
import AudioTrackInfo from './AudioTrackInfo.vue';
import AudioProgressBar from './AudioProgressBar.vue';
import AudioControls from './AudioControls.vue';
import { usePluginsStore } from '@renderer/stores/plugins';
import { resolveElementDecoration } from '@renderer/utils/audioView';
import { elementStyle } from '@renderer/utils/audioElementStyle';
import type { AudioLayoutElement } from '@renderer/types/settings';

// Free-canvas element renderer extracted from AudioView (plan 6.3 follow-up).
// Drag state stays with the view/composable; this component only renders and
// forwards the drag mousedown.

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
    <!-- Visualization (with built-in toolbar) -->
    <template v-if="el.id === 'visualization'">
      <div class="relative w-full h-full">
        <AudioVisualizer class="w-full h-full" />
      </div>
    </template>

    <!-- Cover -->
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

    <!-- Track Info -->
    <template v-else-if="el.id === 'trackInfo'">
      <div
        class="w-full h-full flex items-center justify-center px-4 transition-opacity"
        :class="{ 'opacity-0 pointer-events-none': props.isFullscreen && !props.uiVisible }"
        @mousedown="emit('element-mousedown', $event, el)"
      >
        <AudioTrackInfo :variant="el.variant ?? 'classic'" />
      </div>
    </template>

    <!-- Progress -->
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

    <!-- Controls -->
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
