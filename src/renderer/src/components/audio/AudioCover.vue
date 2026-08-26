<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import MediaCover from '@renderer/components/MediaCover.vue';

defineProps<{ size?: string }>();

const player = usePlayerStore();
const audio = useAudioPlayer();

const pulseScale = ref(1);
let animFrame: number | null = null;
let dataArray: Uint8Array | null = null;

function measurePulse() {
  if (!audio.analyserNode || !audio.isPlaying.value) {
    animFrame = requestAnimationFrame(measurePulse);
    return;
  }

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
    class="rounded-box bg-neutral flex items-center justify-center overflow-hidden shrink-0 transition-transform duration-75"
    :class="size || 'w-96 h-96'"
    :style="{ transform: `scale(${pulseScale})` }"
  >
    <MediaCover
      v-if="player.currentTrack"
      :path="player.currentTrack.path"
      :size="48"
      :autoplay="true"
      fallback="music"
    />
    <MediaCover v-else :size="48" fallback="music" />
  </div>
</template>
