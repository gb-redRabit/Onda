<script setup lang="ts">
import type { Component } from 'vue';
import { ArrowUpRight } from '@lucide/vue';
import type { TabId } from '@renderer/utils/libraryTabs';

interface HomeStatItem {
  value: number;
  key: string;
  color: string;
  tab: TabId;
  icon: Component;
}

// Bento obok hero: liczby biblioteki w jednym kaflu zamiast pięciu osobnych kart.
// Każdy wiersz jest skrótem do właściwej zakładki biblioteki.
//
// Poniżej `xl` kafel nie mieści się obok hero, więc zmienia się w niską siatkę
// (2–3 kolumny), żeby nie spychać półek pod linię wzroku.
defineProps<{ items: HomeStatItem[]; loading: boolean }>();

const emit = defineEmits<{ (e: 'open', tab: TabId): void }>();
</script>

<template>
  <aside
    data-testid="home-stats"
    class="grid h-full grid-cols-2 content-start gap-1 rounded-box border border-base-300 bg-base-100/(--glass-alpha) p-2.5 backdrop-blur fx-depth sm:grid-cols-3 xl:flex xl:flex-col"
  >
    <p
      class="col-span-full px-1.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-base-content/40"
    >
      {{ $t('home.libraryStats') }}
    </p>

    <template v-if="loading">
      <div
        v-for="i in 5"
        :key="i"
        class="flex items-center gap-2 rounded-field px-1.5 py-1.5 xl:gap-3"
      >
        <div
          class="h-7 w-7 shrink-0 animate-pulse rounded-field bg-base-content/10 xl:h-8 xl:w-8"
        />
        <div class="min-w-0 flex-1 space-y-1.5">
          <div class="h-3 w-8 animate-pulse rounded bg-base-content/10" />
          <div class="h-2.5 w-14 animate-pulse rounded bg-base-content/10" />
        </div>
      </div>
    </template>

    <template v-else>
      <button
        v-for="item in items"
        :key="item.tab"
        :data-testid="'home-counter-' + item.tab"
        class="group flex min-w-0 items-center gap-2 rounded-field px-1.5 py-1.5 text-left transition-colors hover:bg-base-content/5 xl:gap-3"
        :title="$t('home.openInLibrary')"
        @click="emit('open', item.tab)"
      >
        <span
          class="grid h-7 w-7 shrink-0 place-items-center rounded-field bg-base-content/5 transition-colors group-hover:bg-base-content/10 xl:h-8 xl:w-8"
        >
          <component :is="item.icon" :size="15" :class="item.color" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-semibold leading-none tabular-nums">
            {{ item.value }}
          </span>
          <span class="mt-1 block truncate text-[11px] text-base-content/50">
            {{ $t(item.key) }}
          </span>
        </span>
        <ArrowUpRight
          :size="14"
          class="hidden shrink-0 text-base-content/25 opacity-0 transition-opacity group-hover:opacity-100 xl:block"
        />
      </button>
    </template>
  </aside>
</template>
