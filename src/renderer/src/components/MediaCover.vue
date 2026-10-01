<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { Music2, Play, Disc3, Film } from '@lucide/vue';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import { VIDEO_EXTS } from '@shared/constants';

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
const inView = ref(false);
let observedTarget: Element | null = null;

// Jeden współdzielony IntersectionObserver dla każdej instancji MediaCover — długa
// (niezwirtualizowana) kolejka tworzyłaby inaczej setki obserwatorów i
// montowałaby setki streamujących <video> naraz, zamrażając aplikację.
const ioHandlers = new WeakMap<Element, (isIntersecting: boolean) => void>();
let sharedObserver: IntersectionObserver | null = null;
function getSharedObserver(): IntersectionObserver | null {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return null;
  if (sharedObserver) return sharedObserver;
  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        ioHandlers.get(entry.target)?.(entry.isIntersecting);
      }
    },
    { rootMargin: '200px 0px' }
  );
  return sharedObserver;
}

const result = computed(() => {
  if (props.cover?.data) return props.cover;
  if (props.path && loaded.value) {
    const cached = player.getCover(props.path);
    if (cached.data) return cached;
  }
  return { type: null, data: null };
});

const isVideoFile = computed(() => {
  if (!result.value.data) return false;
  const d = result.value.data;
  if (!/^[A-Z]:\\/i.test(d) && !d.startsWith('/')) return false;
  const ext = '.' + d.slice(d.lastIndexOf('.') + 1, d.length).toLowerCase();
  return VIDEO_EXTS.includes(ext);
});
const isVideoLike = computed(() => result.value.type === 'video' || isVideoFile.value);
const isVideo = computed(() => isVideoLike.value && props.renderAsVideo);
// Statyczni odbiorcy (kafle folderów, karty albumów) nie mogą pokazać odtwarzanego wideo —
// zatrzymany <video> i tak renderuje pierwszą klatkę, inaczej niż <img> wskazujący
// na mp4 (który zawsze renderuje się pusty).
const isStaticVideo = computed(() => isVideoLike.value && !props.renderAsVideo);
const src = computed(() => {
  if (!result.value.data) return '';
  if (result.value.type === 'video' || isVideoFile.value)
    return toMediaServerUrl(result.value.data);
  return result.value.data;
});

function onVideoEnded(e: Event) {
  const video = e.target as HTMLVideoElement;
  video.currentTime = 0;
  video.play();
}

const videoRef = ref<HTMLVideoElement>();

function applyAutoplay(on: boolean) {
  const v = videoRef.value;
  if (!v) return;
  if (on) {
    v.play().catch(() => undefined);
  } else {
    v.pause();
  }
}

watch(
  () => props.autoplay,
  (on) => applyAutoplay(on)
);
watch(isVideo, (v) => {
  if (v && props.autoplay) {
    nextTick(() => applyAutoplay(true));
  }
});

const iconComponent = computed(() => {
  if (props.fallback === 'play') return Play;
  if (props.fallback === 'disc') return Disc3;
  if (props.fallback === 'film') return Film;
  return Music2;
});

const iconSize = computed(() => Math.max(12, Math.round(props.size * 0.35)));

onMounted(() => {
  if (!props.path || props.cover?.data) {
    inView.value = true;
    loaded.value = true;
    return;
  }

  const cached = player.getCover(props.path);
  if (cached.data) loaded.value = true;

  const obs = getSharedObserver();
  if (!obs || !el.value) {
    // Brak dostępnego IntersectionObserver (jsdom, stare środowisko) — ładuj natychmiast.
    loaded.value = true;
    inView.value = true;
    player.loadCover(props.path);
    return;
  }

  observedTarget = el.value;
  ioHandlers.set(observedTarget, (isIntersecting) => {
    // Okładki wideo montują element <video> tylko w pobliżu viewportu, więc
    // długa kolejka nigdy nie tworzy setek równoczesnych strumieni media-servera.
    inView.value = isIntersecting;
    if (isIntersecting) {
      loaded.value = true;
      player.loadCover(props.path!);
    }
  });
  obs.observe(observedTarget);
});

onUnmounted(() => {
  if (observedTarget) {
    getSharedObserver()?.unobserve(observedTarget);
    ioHandlers.delete(observedTarget);
    observedTarget = null;
  }
});
</script>

<template>
  <div ref="el" class="w-full h-full overflow-hidden flex items-center justify-center">
    <video
      v-if="isVideo && inView"
      ref="videoRef"
      :src="src"
      class="w-full h-full object-cover"
      :autoplay="autoplay"
      muted
      preload="auto"
      playsinline
      @ended="onVideoEnded"
    />
    <video
      v-else-if="isStaticVideo && inView"
      :src="src"
      class="w-full h-full object-cover"
      muted
      preload="auto"
      playsinline
    />
    <img
      v-else-if="result.data && !isVideoLike"
      alt=""
      :src="src"
      class="w-full h-full object-cover"
    />
    <component :is="iconComponent" v-else :size="iconSize" />
  </div>
</template>
