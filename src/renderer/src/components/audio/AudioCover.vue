<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import MediaCover from '@renderer/components/MediaCover.vue';

const props = defineProps<{ size?: string; variant?: string; decoration?: string }>();

const COVER_SHAPE_CLIP: Record<string, string> = {
  circle: 'circle(50%)',
  triangle: 'polygon(50% 0%, 0% 100%, 100% 100%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  hexagon: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)'
};

const COVER_PLUGIN_CLIP: Record<string, string> = {
  'plugin:cover:flip-x': 'polygon(50% 0%, 100% 0%, 50% 100%, 0% 100%)'
};

const player = usePlayerStore();
const audio = useAudioPlayer();

const pulseScale = ref(1);
let animFrame: number | null = null;
let frame = 0;
let dataArray: Uint8Array<ArrayBuffer> | null = null;

const coverClass = computed(() => {
  switch (props.variant) {
    case 'rounded':
      return 'rounded-2xl bg-neutral border border-base-content/15';
    case 'glass':
      return 'rounded-2xl bg-neutral';
    default:
      return 'rounded-box bg-neutral';
  }
});

const coverClip = computed(() => {
  if (props.variant === 'ring') return undefined;
  if (props.decoration && COVER_SHAPE_CLIP[props.decoration])
    return COVER_SHAPE_CLIP[props.decoration];
  if (props.decoration && COVER_PLUGIN_CLIP[props.decoration])
    return COVER_PLUGIN_CLIP[props.decoration];
  return undefined;
});

function measurePulse() {
  if (!audio.analyserNode || !audio.isPlaying.value) {
    animFrame = requestAnimationFrame(measurePulse);
    return;
  }

  // Sample bass at ~30fps (skip every other frame); audio juice does not change faster
  frame++;
  if ((frame & 1) === 1) pulseScale.value = 1;

  const analyser = audio.analyserNode;
  const bufferLength = analyser.frequencyBinCount;
  if (!dataArray || dataArray.length !== bufferLength) {
    dataArray = new Uint8Array(bufferLength);
  }
  analyser.getByteFrequencyData(dataArray);

  // Bass energy (low frequencies = first ~10 bins)
  const bassEnd = Math.min(10, bufferLength);
  let bassSum = 0;
  for (let i = 0; i < bassEnd; i++) bassSum += dataArray[i];
  const bassAvg = bassSum / bassEnd / 255;

  // Map 0-1 bass to scale 1.0-1.06 (subtle pulse)
  pulseScale.value = 1 + bassAvg * 0.06;

  animFrame = requestAnimationFrame(measurePulse);
}

onMounted(() => {
  if (audio.isPlaying.value) animFrame = requestAnimationFrame(measurePulse);
});

watch(
  () => audio.isPlaying.value,
  (playing) => {
    if (playing && !animFrame) animFrame = requestAnimationFrame(measurePulse);
    else if (!playing && animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
      pulseScale.value = 1;
    }
  }
);

onUnmounted(() => {
  if (animFrame) cancelAnimationFrame(animFrame);
});
</script>

<template>
  <div
    v-if="variant === 'ring'"
    class="relative flex items-center justify-center shrink-0 transition-transform duration-75"
    :class="[size || 'w-96 h-96']"
    :style="{ transform: `scale(${pulseScale})`, clipPath: coverClip }"
  >
    <div
      class="absolute rounded-full ring-2 ring-primary/30 h-[96%] aspect-square pointer-events-none"
    />
    <div class="relative h-[88%] aspect-square rounded-full overflow-hidden shadow-lg bg-neutral">
      <MediaCover
        v-if="player.currentTrack"
        :path="player.currentTrack.path"
        :size="48"
        :autoplay="true"
        fallback="music"
      />
      <MediaCover v-else :size="48" fallback="music" />
      <div class="absolute inset-0 rounded-full ring-2 ring-primary/60 pointer-events-none" />
    </div>
  </div>

  <div
    v-else
    class="relative flex items-center justify-center overflow-hidden shrink-0 transition-transform duration-75"
    :class="[size || 'w-96 h-96', coverClass]"
    :style="{ transform: `scale(${pulseScale})`, clipPath: coverClip }"
  >
    <div v-if="variant === 'rounded'" class="w-full h-full p-1.5">
      <div class="w-full h-full overflow-hidden rounded-xl ring-1 ring-inset ring-base-content/20">
        <MediaCover
          v-if="player.currentTrack"
          :path="player.currentTrack.path"
          :size="48"
          :autoplay="true"
          fallback="music"
        />
        <MediaCover v-else :size="48" fallback="music" />
      </div>
    </div>
    <template v-else>
      <div v-if="variant === 'glass'" class="w-full h-full opacity-85 saturate-75 blur-[1px]">
        <MediaCover
          v-if="player.currentTrack"
          :path="player.currentTrack.path"
          :size="48"
          :autoplay="true"
          fallback="music"
        />
        <MediaCover v-else :size="48" fallback="music" />
      </div>
      <template v-else>
        <MediaCover
          v-if="player.currentTrack"
          :path="player.currentTrack.path"
          :size="48"
          :autoplay="true"
          fallback="music"
        />
        <MediaCover v-else :size="48" fallback="music" />
      </template>
    </template>
    <div
      v-if="variant === 'glass'"
      class="absolute inset-0 pointer-events-none bg-white/20 backdrop-blur-[3px] border border-white/30 shadow-[inset_0_0_24px_rgba(255,255,255,0.15),inset_0_-12px_24px_rgba(0,0,0,0.3)]"
    />
  </div>
</template>
