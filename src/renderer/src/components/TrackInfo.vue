<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { Heart } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import type { MediaFile } from '@renderer/types/media';

// Single track-info component for the whole app.
//  - variant 'inline' (default): the compact left-aligned title/artist used in
//    the player bar, mini bar and queue.
//  - variant 'audio': the centered, density-aware, marquee title/artist (with an
//    optional favourite) used by the audio-view canvas.
// Merging the two removed a near-duplicate and its separate prop API.

const { t } = useI18n();
const player = usePlayerStore();

const props = withDefaults(
  defineProps<{
    track: MediaFile | null;
    variant?: 'inline' | 'audio';
    audioVariant?: string;
    showArtist?: boolean;
    showAlbum?: boolean;
    titleSize?: string;
    artistSize?: string;
    titleClass?: string;
    artistClass?: string;
    showFallback?: boolean;
    showFavorite?: boolean;
  }>(),
  {
    variant: 'inline',
    audioVariant: 'classic',
    showArtist: true,
    showAlbum: false,
    titleSize: '',
    artistSize: '',
    titleClass: '',
    artistClass: '',
    showFallback: true,
    showFavorite: false
  }
);

// --- inline variant ---
const displayTitle = computed(
  () =>
    props.track?.metadata?.title ||
    props.track?.name ||
    (props.showFallback ? t('playerBar.noTrack') : '')
);
const displayArtist = computed(() => {
  if (!props.showArtist) return '';
  if (props.track?.metadata?.artist) return props.track.metadata.artist;
  if (props.track?.metadata?.album) return props.track.metadata.album;
  return props.showFallback ? t('common.unknown') : '';
});
const displayAlbum = computed(() =>
  props.showAlbum && props.track?.metadata?.album ? props.track.metadata.album : ''
);

// --- audio variant ---
const isMinimal = computed(() => props.audioVariant === 'minimal');
const isLarge = computed(() => props.audioVariant === 'large');
type Density = 'roomy' | 'fit' | 'tight';
const density = ref<Density>('roomy');
const rootEl = ref<HTMLElement | null>(null);
let ro: ResizeObserver | null = null;

onMounted(() => {
  if (props.variant !== 'audio' || !rootEl.value) return;
  ro = new ResizeObserver((entries) => {
    const h = entries[0].contentRect.height;
    density.value = h >= 44 ? 'roomy' : h >= 30 ? 'fit' : 'tight';
  });
  ro.observe(rootEl.value);
});
onBeforeUnmount(() => ro?.disconnect());

const audioTitleClass = computed(() => {
  if (props.titleSize) return props.titleSize;
  if (isMinimal.value) return 'text-sm';
  if (isLarge.value) {
    return density.value === 'roomy' ? 'text-2xl' : density.value === 'fit' ? 'text-lg' : 'text-sm';
  }
  return density.value === 'roomy' ? 'text-lg' : density.value === 'fit' ? 'text-base' : 'text-sm';
});
const audioArtistClass = computed(() => {
  if (props.artistSize) return props.artistSize;
  if (density.value === 'tight') return 'text-[11px]';
  return isLarge.value && density.value === 'roomy' ? 'text-base' : 'text-sm';
});
const showAudioArtist = computed(() => !isMinimal.value && density.value !== 'tight');
const showHeart = computed(
  () => props.showFavorite && density.value === 'roomy' && !isMinimal.value && !isLarge.value
);
const audioArtist = computed(() => props.track?.metadata?.artist || '');
const audioAlbum = computed(() => props.track?.metadata?.album || '');
const isFavorite = computed(() => !!props.track && player.isFavorite(props.track.path));

const titleEl = ref<HTMLElement | null>(null);
const artistEl = ref<HTMLElement | null>(null);
const titleNeedsMarquee = ref(false);
const artistNeedsMarquee = ref(false);

function checkOverflow() {
  if (props.variant !== 'audio') return;
  nextTick(() => {
    if (titleEl.value) {
      const overflow = titleEl.value.scrollWidth - titleEl.value.clientWidth;
      titleNeedsMarquee.value = overflow > 0;
      if (overflow > 0) titleEl.value.style.setProperty('--marquee-offset', `-${overflow}px`);
    }
    if (artistEl.value) {
      const overflow = artistEl.value.scrollWidth - artistEl.value.clientWidth;
      artistNeedsMarquee.value = overflow > 0;
      if (overflow > 0) artistEl.value.style.setProperty('--marquee-offset', `-${overflow}px`);
    }
  });
}
watch([() => props.track, density], checkOverflow);
onMounted(checkOverflow);
</script>

<template>
  <!-- inline -->
  <div v-if="variant === 'inline'" class="min-w-0">
    <div :class="['font-medium truncate', titleSize || 'text-sm', titleClass]">
      {{ displayTitle }}
    </div>
    <div
      v-if="displayArtist"
      :class="['text-base-content/50 truncate', artistSize || 'text-xs', artistClass]"
    >
      {{ displayArtist }}<template v-if="displayAlbum"> · {{ displayAlbum }}</template>
    </div>
  </div>

  <!-- audio -->
  <div
    v-else
    ref="rootEl"
    class="text-center flex flex-col justify-center items-center min-w-0 w-full overflow-hidden"
    :class="density === 'roomy' ? 'gap-1' : 'gap-0.5'"
  >
    <div class="relative w-full overflow-hidden">
      <p
        ref="titleEl"
        :class="[
          'font-semibold text-base-content whitespace-nowrap leading-tight',
          audioTitleClass,
          titleNeedsMarquee ? 'animate-marquee' : 'truncate'
        ]"
      >
        {{ displayTitle }}
      </p>
    </div>
    <div v-if="showAudioArtist && (audioArtist || audioAlbum)" class="relative w-full overflow-hidden">
      <p
        ref="artistEl"
        :class="[
          'text-base-content/70 whitespace-nowrap leading-tight',
          audioArtistClass,
          artistNeedsMarquee ? 'animate-marquee' : 'truncate'
        ]"
      >
        {{ audioArtist }}<template v-if="audioAlbum"> · {{ audioAlbum }}</template>
      </p>
    </div>
    <button
      v-if="showHeart"
      class="mx-auto flex items-center gap-1.5 transition-colors"
      :class="isFavorite ? 'text-error' : 'text-base-content/50 hover:text-error'"
      :aria-pressed="isFavorite"
      :aria-label="isFavorite ? t('common.removeFav') : t('common.addFav')"
      :disabled="!track"
      @click="track && player.toggleFavorite(track.path)"
    >
      <Heart :size="16" :fill="isFavorite ? 'currentColor' : 'none'" />
    </button>
  </div>
</template>
