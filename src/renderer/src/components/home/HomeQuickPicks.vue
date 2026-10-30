<script setup lang="ts">
import { Clock, Play } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';
import type { HomeQuickPick } from '@renderer/composables/useHomeView';
import type { MediaFile } from '@renderer/types/media';

// „Szybki powrót”: ostatnio grane jako siatka poziomych mini-kart. Jedno
// kliknięcie wznawia utwór, bez szukania go na półce z okładkami.
defineProps<{
  items: HomeQuickPick[];
  title: string;
  seeAllLabel?: string;
}>();

const emit = defineEmits<{
  (e: 'seeAll'): void;
  (e: 'play', track: MediaFile): void;
  (e: 'contextmenu', event: MouseEvent, track: MediaFile): void;
}>();
</script>

<template>
  <section data-testid="home-quick-picks">
    <div class="mb-2.5 flex items-center justify-between gap-3">
      <h2
        class="flex min-w-0 items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-base-content/60"
      >
        <Clock :size="14" class="shrink-0 text-primary-text" />
        <span class="truncate">{{ title }}</span>
      </h2>
      <button
        v-if="seeAllLabel"
        type="button"
        class="shrink-0 text-xs font-medium text-primary-text transition-colors hover:text-primary-text/80"
        @click="emit('seeAll')"
      >
        {{ seeAllLabel }}
      </button>
    </div>

    <div class="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="pick in items"
        :key="pick.track.path"
        v-activate
        class="group flex min-w-0 cursor-pointer items-center gap-3 rounded-box border border-base-300/75 bg-base-100 p-2 pr-3 text-left transition-colors hover:border-base-content/20 hover:bg-base-content/4"
        :aria-label="`${$t('common.play')}: ${pick.title}`"
        @click="emit('play', pick.track)"
        @contextmenu="emit('contextmenu', $event, pick.track)"
      >
        <span class="h-10 w-10 shrink-0 overflow-hidden rounded-field bg-base-200">
          <MediaCover
            :path="pick.track.path"
            :size="40"
            :fallback="pick.track.type === 'video' ? 'film' : 'music'"
            class="h-full w-full transition-transform duration-300 group-hover:scale-105"
          />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-xs font-medium text-base-content" :title="pick.title">
            {{ pick.title }}
          </span>
          <span class="mt-0.5 block truncate text-2xs text-base-content/50">{{
            pick.subtitle
          }}</span>
        </span>
        <span
          class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-content opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          aria-hidden="true"
        >
          <Play :size="12" fill="currentColor" class="ml-0.5" />
        </span>
      </div>
    </div>
  </section>
</template>
