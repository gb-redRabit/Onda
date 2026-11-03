<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Heart } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';

// Element „Ulubione” na wolnym płótnie widoku audio. Warianty różnią się tylko
// prezentacją; stan ulubionych jest jeden (settings.favorites) i ten sam co w TrackInfo.

const props = defineProps<{ variant?: string }>();

const player = usePlayerStore();
const { t } = useI18n();

const track = computed(() => player.currentTrack);
const isFavorite = computed(() => (track.value ? player.isFavorite(track.value.path) : false));

const isChip = computed(() => props.variant === 'chip');
const isLarge = computed(() => props.variant === 'large');
const iconSize = computed(() => (isLarge.value ? 30 : isChip.value ? 14 : 18));
const label = computed(() => (isFavorite.value ? t('common.removeFav') : t('common.addFav')));

function toggle(): void {
  if (track.value) void player.toggleFavorite(track.value.path);
}
</script>

<template>
  <div
    data-testid="audio-favorite"
    class="w-full h-full flex items-center justify-center overflow-hidden"
  >
    <button
      type="button"
      class="flex items-center justify-center rounded-full transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/60"
      :class="[
        isChip ? 'gap-1.5 px-2.5 py-1 bg-base-content/8 hover:bg-base-content/12' : 'p-1.5',
        !track ? 'opacity-40 cursor-default' : 'cursor-pointer',
        isFavorite ? 'text-error' : 'text-base-content/55 hover:text-error'
      ]"
      :disabled="!track"
      :aria-pressed="isFavorite"
      :aria-label="label"
      :title="label"
      @click.stop="toggle"
    >
      <Heart :size="iconSize" :fill="isFavorite ? 'currentColor' : 'none'" />
      <span v-if="isChip" class="text-3xs font-medium whitespace-nowrap">
        {{ t('audioView.favoriteLabel') }}
      </span>
    </button>
  </div>
</template>
