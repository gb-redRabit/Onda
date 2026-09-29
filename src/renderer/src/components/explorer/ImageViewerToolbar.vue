<script setup lang="ts">
import {
  X,
  Play,
  Pause,
  Settings2,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Fullscreen
} from '@lucide/vue';
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
      class="ui-icon-button fx-noise fx-depth bg-base-300"
      :title="$t('imageViewer.close')"
      :aria-label="$t('imageViewer.close')"
      @click="emit('close')"
    >
      <X :size="16" class="pointer-events-none" />
    </button>
    <div class="flex-1" />

    <div class="flex flex-col items-center gap-1 bg-neutral rounded-box px-1.5 py-2">
      <div class="relative">
        <button
          class="ui-icon-button fx-noise fx-depth"
          :class="
            slideshowActive
              ? 'text-primary bg-primary/10'
              : 'text-base-content/70 hover:text-base-content hover:bg-base-content/10'
          "
          :title="
            slideshowActive ? $t('imageViewer.stopSlideshow') : $t('imageViewer.startSlideshow')
          "
          :aria-label="
            slideshowActive ? $t('imageViewer.stopSlideshow') : $t('imageViewer.startSlideshow')
          "
          @click="emit('toggleSlideshow')"
        >
          <span v-show="!slideshowActive"><Play :size="16" class="pointer-events-none" /></span>
          <span v-show="slideshowActive"><Pause :size="16" class="pointer-events-none" /></span>
        </button>
        <button
          class="ui-icon-button fx-noise fx-depth block mx-auto mt-0.5"
          :class="
            settingsOpen
              ? 'text-primary bg-primary/10'
              : 'text-base-content/70 hover:text-base-content hover:bg-base-content/10'
          "
          :title="$t('imageViewer.slideshowSettings')"
          :aria-label="$t('imageViewer.slideshowSettings')"
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
        class="ui-icon-button fx-noise fx-depth"
        :title="$t('imageViewer.fitToScreen')"
        :aria-label="$t('imageViewer.fitToScreen')"
        @click="emit('fitToScreen')"
      >
        <Maximize2 :size="16" class="pointer-events-none" />
      </button>
      <button
        class="ui-icon-button fx-noise fx-depth"
        :title="$t('imageViewer.zoomIn')"
        :aria-label="$t('imageViewer.zoomIn')"
        @click="emit('zoomIn')"
      >
        <ZoomIn :size="16" class="pointer-events-none" />
      </button>
      <button
        class="ui-icon-button fx-noise fx-depth"
        :title="$t('imageViewer.zoomOut')"
        :aria-label="$t('imageViewer.zoomOut')"
        @click="emit('zoomOut')"
      >
        <ZoomOut :size="16" class="pointer-events-none" />
      </button>
      <button
        class="ui-icon-button fx-noise fx-depth"
        :title="$t('imageViewer.rotate')"
        :aria-label="$t('imageViewer.rotate')"
        @click="emit('rotate')"
      >
        <RotateCw :size="16" class="pointer-events-none" />
      </button>
      <button
        class="ui-icon-button fx-noise fx-depth"
        :class="
          fullscreen
            ? 'text-primary bg-primary/10'
            : 'text-base-content/70 hover:text-base-content hover:bg-base-content/10'
        "
        :title="$t('imageViewer.fullscreen')"
        :aria-label="$t('imageViewer.fullscreen')"
        @click="emit('toggleFullscreen')"
      >
        <Fullscreen :size="16" class="pointer-events-none" />
      </button>
    </div>

    <div class="flex-1" />
  </div>
</template>
