<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Heart } from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';

defineProps<{ titleSize?: string; artistSize?: string }>();

const { t } = useI18n();
const player = usePlayerStore();

const title = computed(
  () => player.currentTrack?.metadata?.title || player.currentTrack?.name || t('playerBar.noTrack')
);
const artist = computed(() => player.currentTrack?.metadata?.artist || '');
const album = computed(() => player.currentTrack?.metadata?.album || '');
</script>

<template>
  <div class="text-center flex justify-center items-center gap-3">
    <p :class="['font-semibold text-fg-base truncate', titleSize || 'text-lg']">
      {{ title }}
    </p>
    <p v-if="artist || album" :class="['text-fg-muted mt-1 truncate', artistSize || 'text-sm']">
      {{ artist }}<template v-if="album"> · {{ album }}</template>
    </p>
    <button
      class="mx-auto flex items-center gap-1.5 transition-colors"
      :class="
        player.currentTrack && player.isFavorite(player.currentTrack.path)
          ? 'text-red-base'
          : 'text-fg-faint hover:text-red-base'
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
