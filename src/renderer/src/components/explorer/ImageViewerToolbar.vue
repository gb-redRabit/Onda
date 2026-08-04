<script setup lang="ts">
import { X, Play, Pause, Settings2, Maximize2, ZoomIn, ZoomOut, RotateCw, Fullscreen } from '@lucide/vue';
import ImageViewerSettings from './ImageViewerSettings.vue';

defineProps<{
  slideshowActive: boolean;
  settingsOpen: boolean;
  slideshowInterval: number;
  transitionType: string;
  transitionDuration: number;
  loop: boolean;
  shuffle: boolean;
  kenBurns: boolean;
  autoHide: boolean;
  fullscreen: boolean;
  uiVisible: boolean;
}>();
const emit = defineEmits<{
  close: [];
  toggleSlideshow: [];
  toggleSettings: [];
  fitToScreen: [];
  zoomIn: [];
  zoomOut: [];
  rotate: [];
  toggleFullscreen: [];
  'update:interval': [value: number];
  'update:transition-type': [value: string];
  'update:transition-duration': [value: number];
  'update:loop': [value: boolean];
  'update:shuffle': [value: boolean];
  'update:ken-burns': [value: boolean];
  'update:auto-hide': [value: boolean];
}>();
</script>

<template>
  <div
    class="absolute right-0 inset-y-0 flex flex-col items-center px-2 py-3 gap-1 transition-all duration-300"
    :class="slideshowActive && !uiVisible ? 'opacity-0 pointer-events-none' : ''"
    @click.stop
  >
    <button
      class="p-1.5 rounded-lg bg-bg-overlay/80 text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
      title="Close (Esc)"
      @click="emit('close')"
    >
      <X :size="16" class="pointer-events-none" />
    </button>
    <div class="flex-1" />

    <div class="flex flex-col items-center gap-1 bg-bg-overlay/80 rounded-xl px-1.5 py-2">
      <div class="relative">
        <button
          class="p-1.5 rounded-lg transition-colors"
          :class="
            slideshowActive ? 'text-accent-base bg-accent-ghost' : 'text-fg-muted hover:text-fg-base hover:bg-bg-hover'
          "
          :title="slideshowActive ? 'Stop slideshow (Space)' : 'Start slideshow (Space)'"
          @click="emit('toggleSlideshow')"
        >
          <span v-show="!slideshowActive"><Play :size="16" class="pointer-events-none" /></span>
          <span v-show="slideshowActive"><Pause :size="16" class="pointer-events-none" /></span>
        </button>
        <button
          class="p-1 rounded-lg transition-colors block mx-auto mt-0.5"
          :class="settingsOpen ? 'text-accent-base bg-accent-ghost' : 'text-fg-muted hover:text-fg-base hover:bg-bg-hover'"
          title="Slideshow settings"
          @click="emit('toggleSettings')"
        >
          <Settings2 :size="12" class="pointer-events-none" />
        </button>
        <ImageViewerSettings
          v-if="settingsOpen"
          :interval="slideshowInterval"
          :transition-type="transitionType"
          :transition-duration="transitionDuration"
          :loop="loop"
          :shuffle="shuffle"
          :ken-burns="kenBurns"
          :auto-hide="autoHide"
          @update:interval="emit('update:interval', $event)"
          @update:transition-type="emit('update:transition-type', $event)"
          @update:transition-duration="emit('update:transition-duration', $event)"
          @update:loop="emit('update:loop', $event)"
          @update:shuffle="emit('update:shuffle', $event)"
          @update:ken-burns="emit('update:ken-burns', $event)"
          @update:auto-hide="emit('update:auto-hide', $event)"
        />
      </div>

      <button
        class="p-1.5 rounded-lg text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
        title="Fit to screen"
        @click="emit('fitToScreen')"
      >
        <Maximize2 :size="16" class="pointer-events-none" />
      </button>
      <button
        class="p-1.5 rounded-lg text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
        title="Zoom In (+)"
        @click="emit('zoomIn')"
      >
        <ZoomIn :size="16" class="pointer-events-none" />
      </button>
      <button
        class="p-1.5 rounded-lg text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
        title="Zoom Out (-)"
        @click="emit('zoomOut')"
      >
        <ZoomOut :size="16" class="pointer-events-none" />
      </button>
      <button
        class="p-1.5 rounded-lg text-fg-muted hover:text-fg-base hover:bg-bg-hover transition-colors"
        title="Rotate (R)"
        @click="emit('rotate')"
      >
        <RotateCw :size="16" class="pointer-events-none" />
      </button>
      <button
        class="p-1.5 rounded-lg transition-colors"
        :class="fullscreen ? 'text-accent-base bg-accent-ghost' : 'text-fg-muted hover:text-fg-base hover:bg-bg-hover'"
        title="Fullscreen (F)"
        @click="emit('toggleFullscreen')"
      >
        <Fullscreen :size="16" class="pointer-events-none" />
      </button>
    </div>

    <div class="flex-1" />
  </div>
</template>