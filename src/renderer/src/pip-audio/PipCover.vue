<script setup lang="ts">
import { ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    isVideo: boolean;
    videoSrc: string;
    imgSrc: string | null;
    playing?: boolean;
    size?: 'sm' | 'lg';
  }>(),
  { playing: false, size: 'lg' }
);

// W oknie pip tylko jeden layout jest renderowany naraz, więc ten ref zawsze
// wskazuje aktywny <video>.
const videoEl = ref<HTMLVideoElement | null>(null);

watch(
  () => props.playing,
  (playing) => {
    const v = videoEl.value;
    if (!v) return;
    if (playing && v.paused && !v.ended) {
      v.play().catch(() => {});
    } else if (!playing && !v.paused) {
      v.pause();
    }
  }
);

function onCoverVideoError(e: Event) {
  (e.target as HTMLVideoElement).style.display = 'none';
}

const videoClass = `block object-cover rounded-(--radius-field) ${
  props.size === 'sm' ? 'h-11 w-11' : 'h-24 w-24'
}`;
const imgClass = `block object-cover rounded-(--radius-field) ${
  props.size === 'sm' ? 'h-13 w-13' : 'h-24 w-24'
}`;
const phClass = `rounded-(--radius-field) bg-base-content/10 ${
  props.size === 'sm' ? 'h-13 w-13' : 'h-24 w-24'
}`;
</script>

<template>
  <video
    v-if="isVideo"
    ref="videoEl"
    :src="videoSrc"
    :class="videoClass"
    :autoplay="playing"
    muted
    loop
    playsinline
    @error="onCoverVideoError"
  />
  <img v-else-if="imgSrc" :src="imgSrc" :class="imgClass" alt="" />
  <div v-else :class="phClass"></div>
</template>