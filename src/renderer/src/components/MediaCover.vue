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
    /** Statyczne siatki: okładkę-wideo pokaż jako nieruchomą klatkę (bez streamowania). */
    still?: boolean;
    fallback?: 'music' | 'play' | 'disc' | 'film';
  }>(),
  {
    size: 40,
    autoplay: false,
    renderAsVideo: true,
    still: false,
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

// Statyczne siatki proszą o jedną klatkę zamiast montować `<video>` przy każdym
// przewinięciu. Klatka jest cache'owana w store i wraca natychmiast po remount.
const stillCover = computed(() =>
  props.still && props.path ? player.getCoverStill(props.path) : null
);

// W siatkach okładka-wideo gra dopiero po najechaniu (jeden strumień zamiast wielu),
// a po zjechaniu myszką wraca do zapamiętanej klatki.
const hovering = ref(false);
const shouldPlay = computed(() => props.autoplay || (props.still && hovering.value));
const animateVideo = computed(() => isVideoLike.value && (!props.still || shouldPlay.value));
// Wideo montuje się z `opacity-0` i pojawia się dopiero po pierwszej klatce.
// Bez tego najechanie na kartę odmontowywało statyczną klatkę i pokazywało
// puste/black `<video>` do czasu dekodowania — stąd „mignięcie”.
const videoReady = ref(false);

function maybeLoadStill(): void {
  if (!props.still || !props.path || stillCover.value?.data) return;
  const cached = player.getCover(props.path);
  const videoPath =
    cached.type === 'video' ? cached.data : props.cover?.type === 'video' ? props.cover.data : null;
  if (videoPath) player.loadCoverStill(props.path, videoPath);
}
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

watch(shouldPlay, (on) => nextTick(() => applyAutoplay(on)), { immediate: false });
watch(animateVideo, (on) => {
  if (!on) videoReady.value = false;
});
watch(isVideoLike, (v) => {
  if (v && shouldPlay.value) {
    nextTick(() => applyAutoplay(true));
  }
});

// Okładka-wideo może dojść asynchronicznie (IPC); dopiero wtedy znamy ścieżkę wideo
// do wyciągnięcia nieruchomej klatki.
watch(
  () => result.value.type,
  (type) => {
    if (type === 'video') maybeLoadStill();
  }
);

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
  maybeLoadStill();

  const obs = getSharedObserver();
  if (!obs || !el.value) {
    // Brak dostępnego IntersectionObserver (jsdom, stare środowisko) — ładuj
    // natychmiast, ale nie ponawiaj requestu, jeśli cache już ma okładkę.
    loaded.value = true;
    inView.value = true;
    if (!cached.data) player.loadCover(props.path);
    return;
  }

  observedTarget = el.value;
  ioHandlers.set(observedTarget, (isIntersecting) => {
    // Okładki wideo montują element <video> tylko w pobliżu viewportu, więc
    // długa kolejka nigdy nie tworzy setek równoczesnych strumieni media-servera.
    inView.value = isIntersecting;
    if (isIntersecting) {
      loaded.value = true;
      if (!player.getCover(props.path!).data) player.loadCover(props.path!);
      maybeLoadStill();
    }
  });
  obs.observe(observedTarget);
});

watch(
  () => props.path,
  (path) => {
    if (!path || props.cover?.data) {
      inView.value = true;
      loaded.value = true;
      return;
    }
    loaded.value = false;
    const cached = player.getCover(path);
    if (cached.data) {
      loaded.value = true;
      maybeLoadStill();
      return;
    }
    // Element jest już w viewporcie (wirtualizowany wiersz został reużyty):
    // IntersectionObserver nie wyemituje drugi raz, więc ładujemy od razu.
    if (inView.value) player.loadCover(path);
  }
);

onUnmounted(() => {
  if (observedTarget) {
    getSharedObserver()?.unobserve(observedTarget);
    ioHandlers.delete(observedTarget);
    observedTarget = null;
  }
});
</script>

<template>
  <div
    ref="el"
    class="relative w-full h-full overflow-hidden flex items-center justify-center"
    @mouseenter="hovering = true"
    @mouseleave="hovering = false"
  >
    <!-- Statyczna klatka zostaje pod wideo aż do pierwszej zdekodowanej klatki,
         więc najechanie nie zostawia pustego miejsca. -->
    <img
      v-if="stillCover?.data"
      alt=""
      :src="stillCover.data"
      class="absolute inset-0 w-full h-full object-cover"
    />
    <video
      v-if="isVideoLike && animateVideo && inView"
      ref="videoRef"
      :src="src"
      class="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
      :class="!props.still || videoReady ? 'opacity-100' : 'opacity-0'"
      :autoplay="shouldPlay"
      muted
      preload="auto"
      playsinline
      @loadeddata="videoReady = true"
      @ended="onVideoEnded"
    />
    <img
      v-else-if="result.data && !isVideoLike"
      alt=""
      :src="src"
      class="w-full h-full object-cover"
    />
    <component :is="iconComponent" v-else-if="!stillCover?.data" :size="iconSize" />
  </div>
</template>
