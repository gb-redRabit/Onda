<script setup lang="ts">
import { computed } from 'vue';
import { Play, History, RotateCcw } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';
import { formatDuration } from '@renderer/utils/formatters';
import type { MediaFile } from '@renderer/types/media';

const props = defineProps<{
  track: MediaFile;
  /** Zapisana pozycja odtwarzania w sekundach (0 = nigdy nie rozpoczęto). */
  position: number;
}>();

const emit = defineEmits<{ (e: 'play'): void; (e: 'playFromStart'): void }>();

const duration = computed(() => props.track.duration || props.track.metadata?.duration || 0);
const title = computed(() => props.track.metadata?.title || props.track.name);
const subtitle = computed(() => props.track.metadata?.artist || props.track.metadata?.album || '');
const percent = computed(() =>
  duration.value > 0 ? Math.min(100, (props.position / duration.value) * 100) : 0
);
const hasProgress = computed(() => props.position > 5);
</script>

<template>
  <section class="mb-8" data-testid="home-continue">
    <h2 class="text-base font-semibold flex items-center gap-2 mb-3">
      <History :size="16" class="text-primary" />
      {{ $t('home.continueTitle') }}
    </h2>
    <div
      class="flex items-center gap-4 p-4 rounded-box bg-base-100 border border-base-300 fx-depth fx-noise"
    >
      <div class="w-24 h-24 rounded-box overflow-hidden shrink-0 bg-base-content/10">
        <MediaCover
          :path="track.path"
          :size="96"
          :fallback="track.type === 'video' ? 'film' : 'music'"
          class="w-full h-full"
        />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold truncate" :title="title">{{ title }}</div>
        <div v-if="subtitle" class="text-xs text-base-content/50 truncate mt-0.5">
          {{ subtitle }}
        </div>
        <div v-if="hasProgress" class="mt-2.5">
          <div v-if="duration > 0" class="h-1.5 rounded-full bg-base-content/10 overflow-hidden">
            <div class="h-full bg-primary" :style="{ width: percent + '%' }" />
          </div>
          <div class="mt-1 text-[11px] text-base-content/50 font-mono">
            {{ formatDuration(position)
            }}<span v-if="duration > 0"> / {{ formatDuration(duration) }}</span>
          </div>
        </div>
        <div v-else-if="duration" class="mt-1 text-[11px] text-base-content/50 font-mono">
          {{ formatDuration(duration) }}
        </div>
      </div>
      <div class="shrink-0 flex items-center gap-2">
        <button
          v-if="hasProgress"
          class="fx-noise flex items-center gap-2 px-3 py-2 rounded-field bg-base-200 border border-base-300 text-base-content text-sm font-medium hover:bg-base-content/10 transition-colors fx-depth"
          @click="emit('playFromStart')"
        >
          <RotateCcw :size="16" />
          {{ $t('home.playFromStart') }}
        </button>
        <button
          class="fx-noise flex items-center gap-2 px-4 py-2 rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 transition-colors fx-depth"
          @click="emit('play')"
        >
          <Play :size="16" />
          {{ hasProgress ? $t('home.resume') : $t('common.play') }}
        </button>
      </div>
    </div>
  </section>
</template>
