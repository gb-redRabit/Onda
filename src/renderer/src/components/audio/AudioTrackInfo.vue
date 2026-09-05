<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { Heart } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';

const props = defineProps<{ titleSize?: string; artistSize?: string; variant?: string }>();

const { t } = useI18n();
const player = usePlayerStore();

const isMinimal = computed(() => props.variant === 'minimal');
const isLarge = computed(() => props.variant === 'large');

type Density = 'roomy' | 'fit' | 'tight';
const density = ref<Density>('roomy');
const rootEl = ref<HTMLElement | null>(null);
let ro: ResizeObserver | null = null;

onMounted(() => {
  if (!rootEl.value) return;
  ro = new ResizeObserver((entries) => {
    const h = entries[0].contentRect.height;
    density.value = h >= 44 ? 'roomy' : h >= 30 ? 'fit' : 'tight';
  });
  ro.observe(rootEl.value);
});

onBeforeUnmount(() => {
  ro?.disconnect();
});

const titleClass = computed(() => {
  if (props.titleSize) return props.titleSize;
  if (isMinimal.value) return 'text-sm';
  if (isLarge.value) {
    return density.value === 'roomy' ? 'text-2xl' : density.value === 'fit' ? 'text-lg' : 'text-sm';
  }
  return density.value === 'roomy' ? 'text-lg' : density.value === 'fit' ? 'text-base' : 'text-sm';
});
const artistClass = computed(() => {
  if (props.artistSize) return props.artistSize;
  if (density.value === 'tight') return 'text-[11px]';
  return isLarge.value && density.value === 'roomy' ? 'text-base' : 'text-sm';
});
const showArtist = computed(() => !isMinimal.value && density.value !== 'tight');
const showHeart = computed(
  () => density.value === 'roomy' && props.variant !== 'minimal' && props.variant !== 'large'
);

const titleEl = ref<HTMLElement | null>(null);
const artistEl = ref<HTMLElement | null>(null);
const titleNeedsMarquee = ref(false);
const artistNeedsMarquee = ref(false);

const title = computed(
  () => player.currentTrack?.metadata?.title || player.currentTrack?.name || t('playerBar.noTrack')
);
const artist = computed(() => player.currentTrack?.metadata?.artist || '');
const album = computed(() => player.currentTrack?.metadata?.album || '');

function checkOverflow() {
  nextTick(() => {
    if (titleEl.value) {
      const overflow = titleEl.value.scrollWidth - titleEl.value.clientWidth;
      titleNeedsMarquee.value = overflow > 0;
      if (overflow > 0) {
        titleEl.value.style.setProperty('--marquee-offset', `-${overflow}px`);
      }
    }
    if (artistEl.value) {
      const overflow = artistEl.value.scrollWidth - artistEl.value.clientWidth;
      artistNeedsMarquee.value = overflow > 0;
      if (overflow > 0) {
        artistEl.value.style.setProperty('--marquee-offset', `-${overflow}px`);
      }
    }
  });
}

watch([title, artist], checkOverflow);
onMounted(checkOverflow);
</script>

<template>
  <div
    ref="rootEl"
    class="text-center flex flex-col justify-center items-center min-w-0 w-full overflow-hidden"
    :class="density === 'roomy' ? 'gap-1' : 'gap-0.5'"
  >
    <div class="relative w-full overflow-hidden">
      <p
        ref="titleEl"
        :class="[
          'font-semibold text-base-content whitespace-nowrap leading-tight',
          titleClass,
          titleNeedsMarquee ? 'animate-marquee' : 'truncate'
        ]"
      >
        {{ title }}
      </p>
    </div>
    <div v-if="showArtist && (artist || album)" class="relative w-full overflow-hidden">
      <p
        ref="artistEl"
        :class="[
          'text-base-content/70 whitespace-nowrap leading-tight',
          artistClass,
          artistNeedsMarquee ? 'animate-marquee' : 'truncate'
        ]"
      >
        {{ artist }}<template v-if="album"> · {{ album }}</template>
      </p>
    </div>
    <button
      v-if="showHeart"
      class="mx-auto flex items-center gap-1.5 transition-colors"
      :class="
        player.currentTrack && player.isFavorite(player.currentTrack.path)
          ? 'text-error'
          : 'text-base-content/50 hover:text-error'
      "
      :disabled="!player.currentTrack"
      @click="player.currentTrack && player.toggleFavorite(player.currentTrack.path)"
    >
      <Heart
        :size="16"
        :fill="
          player.currentTrack && player.isFavorite(player.currentTrack.path)
            ? 'currentColor'
            : 'none'
        "
      />
    </button>
  </div>
</template>
