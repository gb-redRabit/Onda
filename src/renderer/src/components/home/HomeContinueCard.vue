<script setup lang="ts">
import { computed } from 'vue';
import { Film, Music2, Play, RotateCcw } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';
import { formatDuration } from '@renderer/utils/formatters';
import { RESUME_MIN_SECONDS } from '@shared/constants';
import type { MediaFile } from '@renderer/types/media';

// Hero strony głównej: „teraz na tapecie”. Okładka jest jednocześnie tłem
// (rozmyta, przygaszona), więc karta nie potrzebuje dodatkowej grafiki.
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
const hasProgress = computed(() => props.position > RESUME_MIN_SECONDS);
const isVideo = computed(() => props.track.type === 'video');
const typeLabel = computed(() => (isVideo.value ? 'home.mediaTypeVideo' : 'home.mediaTypeAudio'));
const TypeIcon = computed(() => (isVideo.value ? Film : Music2));
const formatLabel = computed(() => (props.track.extension || '').replace(/^\./, '').toUpperCase());
const coverFallback = computed(() => (isVideo.value ? 'film' : 'music'));
</script>

<template>
  <section
    data-testid="home-continue"
    class="flex flex-col justify-center rounded-box border border-base-300/80 bg-base-100 p-4 sm:p-5"
  >
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div
        class="relative h-18 w-18 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-field border border-base-300/70 bg-base-200"
      >
        <MediaCover :path="track.path" :size="88" :fallback="coverFallback" class="h-full w-full" />
      </div>

      <div class="min-w-0 flex-1">
        <div
          class="mb-1 flex flex-wrap items-center gap-1.5 text-2xs font-medium text-base-content/50"
        >
          <span class="font-semibold uppercase tracking-wider text-primary-text">
            {{ $t('home.continueTitle') }}
          </span>
          <span aria-hidden="true">·</span>
          <span class="inline-flex items-center gap-1 text-base-content/65">
            <component :is="TypeIcon" :size="11" class="text-primary-text" />
            {{ $t(typeLabel) }}
          </span>
          <template v-if="formatLabel">
            <span aria-hidden="true">·</span>
            <span class="font-mono text-3xs text-base-content/50">{{ formatLabel }}</span>
          </template>
        </div>

        <h2
          class="truncate text-base font-semibold tracking-tight text-base-content"
          :title="title"
        >
          {{ title }}
        </h2>
        <p v-if="subtitle" class="mt-0.5 truncate text-xs text-base-content/55">
          {{ subtitle }}
        </p>

        <div v-if="hasProgress" class="mt-2.5 flex items-center gap-3">
          <div
            v-if="duration > 0"
            class="h-1 flex-1 max-w-xs rounded-full bg-base-300 overflow-hidden"
            role="progressbar"
            :aria-valuenow="Math.round(percent)"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="title"
          >
            <div class="h-full bg-primary rounded-full" :style="{ width: percent + '%' }" />
          </div>
          <div class="flex items-center gap-2 font-mono text-2xs text-base-content/50 shrink-0">
            <span>
              {{ formatDuration(position)
              }}<span v-if="duration > 0"> / {{ formatDuration(duration) }}</span>
            </span>
            <span v-if="duration > 0" class="text-base-content/40"
              >({{ Math.round(percent) }}%)</span
            >
          </div>
        </div>
        <div v-else-if="duration" class="mt-1.5 font-mono text-2xs text-base-content/50">
          {{ formatDuration(duration) }}
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <button
          type="button"
          class="fx-noise flex h-8.5 items-center gap-1.5 px-3.5 rounded-field bg-primary text-primary-content text-xs font-medium hover:bg-primary/90 transition-colors"
          :aria-label="`${hasProgress ? $t('home.resume') : $t('common.play')}: ${title}`"
          @click="emit('play')"
        >
          <Play :size="14" fill="currentColor" />
          {{ hasProgress ? $t('home.resume') : $t('common.play') }}
        </button>
        <button
          v-if="hasProgress"
          type="button"
          class="fx-noise grid h-8.5 w-8.5 place-items-center rounded-field border border-base-300/80 bg-base-200/50 text-base-content/70 hover:bg-base-content/8 hover:text-base-content transition-colors"
          :aria-label="`${$t('home.playFromStart')}: ${title}`"
          :title="$t('home.playFromStart')"
          @click="emit('playFromStart')"
        >
          <RotateCcw :size="14" />
        </button>
      </div>
    </div>
  </section>
</template>
