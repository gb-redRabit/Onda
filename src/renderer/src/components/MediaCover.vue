<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { Music2, Play, Disc3, Film } from '@lucide/vue';

const props = withDefaults(
  defineProps<{
    path?: string;
    cover?: { type: string | null; data: string | null };
    size?: number;
    autoplay?: boolean;
    renderAsVideo?: boolean;
    fallback?: 'music' | 'play' | 'disc' | 'film';
  }>(),
  {
    size: 40,
    autoplay: false,
    renderAsVideo: true,
    fallback: 'music'
  }
);

const player = usePlayerStore();
const el = ref<HTMLElement>();
const loaded = ref(false);
let observer: IntersectionObserver | null = null;

const result = computed(() => {
  if (props.cover?.data) return props.cover;
  if (props.path && loaded.value) {
    const cached = player.getCover(props.path);
    if (cached.data) return cached;
  }
  return { type: null, data: null };
});

const isVideo = computed(() => result.value.type === 'video' && props.renderAsVideo);
const src = computed(() => {
  if (!result.value.data) return '';
  if (result.value.type === 'video') return 'file:///' + result.value.data.replace(/\\/g, '/');
  return result.value.data;
});

const iconComponent = computed(() => {
  if (props.fallback === 'play') return Play;
  if (props.fallback === 'disc') return Disc3;
  if (props.fallback === 'film') return Film;
  return Music2;
});

const iconSize = computed(() => Math.max(12, Math.round(props.size * 0.35)));

onMounted(() => {
  if (!props.path || props.cover?.data) return;

  const cached = player.getCover(props.path);
  if (cached.data) {
    loaded.value = true;
    return;
  }

  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        observer?.disconnect();
        loaded.value = true;
        player.loadCover(props.path!);
      }
    },
    { rootMargin: '200px 0px' }
  );
  if (el.value) observer.observe(el.value);
});

onUnmounted(() => {
  observer?.disconnect();
});
</script>

<template>
  <div ref="el" class="w-full h-full overflow-hidden flex items-center justify-center">
    <video
      v-if="isVideo"
      :src="src"
      class="w-full h-full object-cover"
      :autoplay="autoplay"
      muted
      loop
      preload="auto"
      playsinline
    />
    <img v-else-if="result.data" :src="src" class="w-full h-full object-cover" />
    <component :is="iconComponent" v-else :size="iconSize" />
  </div>
</template>
