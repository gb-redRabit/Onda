<script setup lang="ts">
import { Play } from '@lucide/vue';
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
  <section class="mb-8" data-testid="home-quick-picks">
    <div class="mb-3 flex items-center justify-between gap-3">
      <h2 class="flex min-w-0 items-center gap-2 text-base font-semibold">
        <span class="truncate">{{ title }}</span>
      </h2>
      <button
        v-if="seeAllLabel"
        class="shrink-0 text-xs font-medium text-primary-text transition-colors hover:text-primary-text/80"
        @click="emit('seeAll')"
      >
        {{ seeAllLabel }}
      </button>
    </div>

    <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="pick in items"
        :key="pick.track.path"
        v-activate
        class="group flex h-14 min-w-0 cursor-pointer items-center gap-2.5 rounded-field border border-base-300 bg-base-100/60 p-1.5 pr-2 text-left transition-colors hover:border-primary/40 hover:bg-base-content/5"
        :aria-label="`${$t('common.play')}: ${pick.title}`"
        @click="emit('play', pick.track)"
        @contextmenu="emit('contextmenu', $event, pick.track)"
      >
        <span class="h-11 w-11 shrink-0 overflow-hidden rounded-field bg-base-200">
          <MediaCover
            :path="pick.track.path"
            :size="44"
            :fallback="pick.track.type === 'video' ? 'film' : 'music'"
            class="h-full w-full"
          />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[13px] font-medium" :title="pick.title">
            {{ pick.title }}
          </span>
          <span class="block truncate text-[11px] text-base-content/50">{{ pick.subtitle }}</span>
        </span>
        <span
          class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-content opacity-0 transition-all duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
          aria-hidden="true"
        >
          <Play :size="14" class="ml-0.5" />
        </span>
      </div>
    </div>
  </section>
</template>
