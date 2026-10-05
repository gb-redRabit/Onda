<script setup lang="ts">
import { ref } from 'vue';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import type { FileItem } from '@renderer/types/explorer';
import ImageViewerThumbnails from './ImageViewerThumbnails.vue';
import ImageViewerToolbar from './ImageViewerToolbar.vue';
import Loader from '@renderer/components/layout/Loader.vue';
import { useImageViewer } from '@renderer/composables/useImageViewer';
import { useDialogFocus } from '@renderer/composables/useDialogFocus';

const props = defineProps<{
  files: FileItem[];
  initialIndex: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const {
  currentIndex,
  scale,
  rotation,
  displaySrc,
  oldSrc,
  imgError,
  settingsOpen,
  fullscreen,
  loop,
  showThumbnails,
  showBottom,
  uiVisible,
  transitionType,
  transitionDuration,
  newStyle,
  oldStyle,
  thumbCache,
  currentFile,
  hasPrev,
  hasNext,
  slideshowActive,
  slideshowInterval,
  slideshowProgress,
  kenBurns,
  shuffleSlideshow,
  autoHideUI,
  prev,
  next,
  goTo,
  zoomIn,
  zoomOut,
  rotate,
  fitToScreen,
  changeInterval,
  handleClose,
  toggleSlideshow,
  toggleFullscreen,
  onImageLoaded,
  onImageError,
  onWheel,
  makeTransform
} = useImageViewer(props, { close: () => emit('close') });

// Pułapka focusu + powrót fokusu po zamknięciu (WCAG 2.4.3). Escape i strzałki
// obsługuje `useImageViewerKeyboard`; tutaj fokus krąży wewnątrz nakładki.
const rootRef = ref<HTMLElement | null>(null);
useDialogFocus(rootRef);
</script>

<template>
  <div
    ref="rootRef"
    data-testid="image-viewer"
    role="dialog"
    aria-modal="true"
    :aria-label="currentFile?.name"
    tabindex="-1"
    class="fixed inset-0 z-50 flex flex-col bg-base-200/95 select-none outline-none"
    :class="slideshowActive && !uiVisible ? 'cursor-none' : ''"
    @click.self="handleClose"
    @wheel.passive="onWheel"
  >
    <div class="flex-1 flex flex-row min-h-0 relative">
      <div class="absolute inset-0 flex items-center justify-center overflow-hidden contain-layout">
        <button
          v-if="hasPrev && !slideshowActive"
          data-testid="image-viewer-prev"
          class="ui-icon-button absolute left-3 z-10 rounded-full bg-base-300 p-2"
          :title="$t('imageViewer.previous')"
          :aria-label="$t('imageViewer.previous')"
          @click="prev"
        >
          <ChevronLeft :size="28" class="pointer-events-none" />
        </button>

        <div class="flex items-center justify-center w-full h-full p-8 contain-layout">
          <img
            v-if="oldSrc"
            :src="oldSrc"
            alt=""
            aria-hidden="true"
            class="absolute inset-0 max-w-full max-h-full m-auto pointer-events-none"
            :style="{
              ...oldStyle,
              transition: `all ${transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              transform: makeTransform(oldStyle.transform),
              willChange: 'transform, opacity, filter'
            }"
            draggable="false"
          />
          <img
            v-show="displaySrc && !imgError"
            :key="currentIndex"
            data-testid="image-viewer-image"
            :src="displaySrc"
            :alt="currentFile?.name || ''"
            class="absolute inset-0 max-w-full max-h-full m-auto"
            :style="{
              ...newStyle,
              transition: `all ${transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              transform: makeTransform(newStyle.transform),
              willChange: 'transform, opacity, filter'
            }"
            draggable="false"
            @load="onImageLoaded"
            @error="onImageError"
            @dblclick="fitToScreen"
          />
          <div v-if="!displaySrc && !oldSrc" class="text-base-content/50 text-sm">
            <div v-if="imgError">{{ $t('imageViewer.loadFailed') }}</div>
            <div v-else class="flex flex-col items-center gap-1">
              <Loader :size="48" />
              <span class="text-xs">{{ $t('imageViewer.loading') }}</span>
            </div>
          </div>
        </div>

        <button
          v-if="hasNext && !slideshowActive"
          data-testid="image-viewer-next"
          class="ui-icon-button absolute right-3 z-10 mr-12 rounded-full bg-base-300 p-2"
          :title="$t('imageViewer.next')"
          :aria-label="$t('imageViewer.next')"
          @click="next"
        >
          <ChevronRight :size="28" class="pointer-events-none" />
        </button>

        <div
          v-if="slideshowActive"
          data-testid="image-viewer-slideshow-progress"
          class="absolute top-0 left-0 right-0 h-0.5 bg-border-default/30 z-10 transition-opacity duration-300"
          :class="uiVisible ? 'opacity-100' : 'opacity-0'"
        >
          <div
            class="h-full bg-primary transition-all duration-150 ease-linear"
            :style="{ width: slideshowProgress + '%' }"
          />
        </div>
      </div>

      <ImageViewerToolbar
        :slideshow-active="slideshowActive"
        :settings-open="settingsOpen"
        :slideshow-interval="slideshowInterval"
        :transition-type="transitionType"
        :transition-duration="transitionDuration"
        :loop="loop"
        :shuffle="shuffleSlideshow"
        :ken-burns="kenBurns"
        :auto-hide="autoHideUI"
        :fullscreen="fullscreen"
        :ui-visible="uiVisible"
        @close="handleClose"
        @toggle-slideshow="toggleSlideshow"
        @toggle-settings="settingsOpen = !settingsOpen"
        @fit-to-screen="fitToScreen"
        @zoom-in="zoomIn"
        @zoom-out="zoomOut"
        @rotate="rotate"
        @toggle-fullscreen="toggleFullscreen"
        @update:interval="changeInterval"
        @update:transition-type="transitionType = $event"
        @update:transition-duration="transitionDuration = $event"
        @update:loop="loop = $event"
        @update:shuffle="shuffleSlideshow = $event"
        @update:ken-burns="kenBurns = $event"
        @update:auto-hide="autoHideUI = $event"
      />
    </div>

    <ImageViewerThumbnails
      :files="files"
      :current-index="currentIndex"
      :thumb-cache="thumbCache"
      :visible="showBottom"
      :show-thumbs="showThumbnails"
      :scale="scale"
      :rotation="rotation"
      :current-file="currentFile"
      @go-to="goTo"
      @update:show-thumbs="showThumbnails = $event"
    />

    <div
      v-if="settingsOpen"
      class="fixed inset-0 z-10"
      role="presentation"
      @click="settingsOpen = false"
    />
  </div>
</template>
