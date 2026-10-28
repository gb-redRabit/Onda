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
    class="relative isolate flex flex-col justify-center overflow-hidden rounded-box border border-base-300 bg-base-100 p-5 fx-depth"
  >
    <!-- Ambient glow: ta sama okładka, rozmyta i przygaszona pod treścią. -->
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 -z-10 scale-125 opacity-25 blur-2xl"
    >
      <MediaCover :path="track.path" :size="48" :fallback="coverFallback" class="h-full w-full" />
    </div>

    <div class="flex flex-col gap-5 sm:flex-row sm:items-center">
      <div
        class="relative h-28 w-28 shrink-0 overflow-hidden rounded-box bg-base-200 shadow-xl ring-1 ring-base-content/10"
      >
        <MediaCover
          :path="track.path"
          :size="112"
          :fallback="coverFallback"
          class="h-full w-full"
        />
      </div>

      <div class="min-w-0 flex-1">
        <div class="mb-1.5 flex flex-wrap items-center gap-2">
          <span
            class="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-text"
          >
            <component :is="TypeIcon" :size="12" />
            {{ $t(typeLabel) }}
          </span>
          <span
            v-if="formatLabel"
            class="rounded-full border border-base-300 px-2 py-0.5 text-[10px] font-medium text-base-content/60"
          >
            {{ formatLabel }}
          </span>
          <span class="text-[11px] font-medium uppercase tracking-wide text-base-content/45">
            {{ $t('home.continueTitle') }}
          </span>
        </div>

        <h2 class="truncate text-lg font-semibold" :title="title">{{ title }}</h2>
        <p v-if="subtitle" class="mt-0.5 truncate text-sm text-base-content/55">
          {{ subtitle }}
        </p>

        <div v-if="hasProgress" class="mt-3">
          <div
            v-if="duration > 0"
            class="h-1.5 rounded-full bg-base-content/10 overflow-hidden"
            role="progressbar"
            :aria-valuenow="Math.round(percent)"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="title"
          >
            <div class="h-full bg-primary" :style="{ width: percent + '%' }" />
          </div>
          <div
            class="mt-1.5 flex items-center justify-between gap-3 font-mono text-[11px] text-base-content/50"
          >
            <span>
              {{ formatDuration(position)
              }}<span v-if="duration > 0"> / {{ formatDuration(duration) }}</span>
            </span>
            <span v-if="duration > 0">{{ Math.round(percent) }}%</span>
          </div>
        </div>
        <div v-else-if="duration" class="mt-2 font-mono text-[11px] text-base-content/50">
          {{ formatDuration(duration) }}
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <button
          class="fx-noise flex items-center gap-2 px-4 py-2 rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 transition-colors fx-depth"
          :aria-label="`${hasProgress ? $t('home.resume') : $t('common.play')}: ${title}`"
          @click="emit('play')"
        >
          <Play :size="16" />
          {{ hasProgress ? $t('home.resume') : $t('common.play') }}
        </button>
        <button
          v-if="hasProgress"
          class="fx-noise grid h-9 w-9 place-items-center rounded-field border border-base-300 bg-base-200/80 text-base-content/70 hover:bg-base-content/10 hover:text-base-content transition-colors"
          :aria-label="`${$t('home.playFromStart')}: ${title}`"
          :title="$t('home.playFromStart')"
          @click="emit('playFromStart')"
        >
          <RotateCcw :size="15" />
        </button>
      </div>
    </div>
  </section>
</template>
