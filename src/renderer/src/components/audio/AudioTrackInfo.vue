<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { Heart } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';

defineProps<{ titleSize?: string; artistSize?: string }>();

const { t } = useI18n();
const player = usePlayerStore();

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
onUnmounted(() => {});
</script>

<template>
  <div class="text-center flex flex-col justify-center items-center gap-1 min-w-0 w-full">
    <div class="relative w-full overflow-hidden">
      <p
        ref="titleEl"
        :class="[
          'font-semibold text-base-content whitespace-nowrap',
          titleSize || 'text-lg',
          titleNeedsMarquee ? 'animate-marquee' : 'truncate'
        ]"
      >
        {{ title }}
      </p>
    </div>
    <div v-if="artist || album" class="relative w-full overflow-hidden">
      <p
        ref="artistEl"
        :class="[
          'text-base-content/70 whitespace-nowrap',
          artistSize || 'text-sm',
          artistNeedsMarquee ? 'animate-marquee' : 'truncate'
        ]"
      >
        {{ artist }}<template v-if="album"> · {{ album }}</template>
      </p>
    </div>
    <button
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
