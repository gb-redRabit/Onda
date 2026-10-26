<script setup lang="ts">
import { ArrowLeft, Maximize2, PictureInPicture, Pin, PinOff } from '@lucide/vue';
import type { MediaFile } from '@renderer/types/media';

defineProps<{
  showControls: boolean;
  track: MediaFile | null;
  pinned: boolean;
}>();

const emit = defineEmits<{
  back: [];
  pip: [];
  fullscreen: [];
  'toggle-pin': [];
}>();
</script>

<template>
  <div
    class="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-linear-to-b from-neutral/80 to-transparent transition-opacity"
    :class="{ 'opacity-0': !showControls }"
  >
    <button
      class="fx-noise p-2 fx-depth rounded-field bg-neutral-content/10 hover:bg-neutral-content/20 text-neutral-content transition-colors"
      :aria-label="$t('playerView.back')"
      @click="emit('back')"
    >
      <ArrowLeft :size="20" />
    </button>
    <div class="text-center flex-1">
      <p class="text-neutral-content text-sm font-medium truncate">
        {{ track?.metadata?.title || track?.name || $t('playerView.noVideo') }}
      </p>
      <p class="text-neutral-content/50 text-xs">{{ track?.metadata?.artist || '' }}</p>
    </div>
    <button
      data-testid="player-always-on-top"
      class="fx-noise p-2 fx-depth rounded-field mr-2 transition-colors"
      :class="
        pinned
          ? 'text-primary-text bg-primary/20'
          : 'bg-neutral-content/10 hover:bg-neutral-content/20 text-neutral-content'
      "
      :title="$t('common.alwaysOnTop')"
      :aria-label="$t('common.alwaysOnTop')"
      :aria-pressed="pinned"
      @click="emit('toggle-pin')"
    >
      <Pin v-if="pinned" :size="18" /><PinOff v-else :size="18" />
    </button>
    <button
      data-testid="player-pip"
      class="fx-noise p-2 fx-depth rounded-field bg-neutral-content/10 mr-2 hover:bg-neutral-content/20 text-neutral-content transition-colors"
      :aria-label="$t('playerView.pip')"
      @click="emit('pip')"
    >
      <PictureInPicture :size="18" />
    </button>
    <button
      class="fx-noise p-2 fx-depth rounded-field bg-neutral-content/10 hover:bg-neutral-content/20 text-neutral-content transition-colors"
      :aria-label="$t('playerView.fullscreen')"
      @click="emit('fullscreen')"
    >
      <Maximize2 :size="18" />
    </button>
  </div>
</template>
