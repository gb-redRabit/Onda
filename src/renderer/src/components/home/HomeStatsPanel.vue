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
    class="flex h-full flex-col justify-between rounded-box border border-base-300/80 bg-base-100 p-3.5"
  >
    <!-- Nagłówek będący jednocześnie skrótem do przeglądu całej biblioteki (items[0]) -->
    <button
      v-if="items[0]"
      type="button"
      :data-testid="'home-counter-' + items[0].tab"
      class="group mb-2.5 flex w-full items-center justify-between gap-2 rounded-field px-1.5 py-1 text-left transition-colors hover:bg-base-content/5"
      :title="$t('home.openInLibrary')"
      @click="emit('open', items[0].tab)"
    >
      <span class="text-[11px] font-semibold uppercase tracking-wider text-base-content/55">
        {{ $t('home.libraryStats') }}
      </span>
      <span class="inline-flex items-center gap-1.5 text-xs text-base-content/65">
        <span class="font-semibold tabular-nums text-base-content">{{ items[0].value }}</span>
        <span class="text-[11px] text-base-content/50">{{ $t(items[0].key) }}</span>
        <ArrowUpRight
          :size="13"
          class="text-base-content/35 transition-colors group-hover:text-primary-text"
        />
      </span>
    </button>

    <div v-if="loading" class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
      <div
        v-for="i in 4"
        :key="i"
        class="flex items-center gap-2.5 rounded-field bg-base-200/40 px-2.5 py-2"
      >
        <div class="h-7 w-7 shrink-0 animate-pulse rounded-field bg-base-content/10" />
        <div class="min-w-0 flex-1 space-y-1">
          <div class="h-3.5 w-8 animate-pulse rounded bg-base-content/10" />
          <div class="h-2.5 w-14 animate-pulse rounded bg-base-content/10" />
        </div>
      </div>
    </div>

    <div v-else class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
      <button
        v-for="item in items.slice(1)"
        :key="item.tab"
        type="button"
        :data-testid="'home-counter-' + item.tab"
        class="group flex min-w-0 items-center gap-2.5 rounded-field border border-transparent bg-base-200/45 px-2.5 py-2 text-left transition-colors hover:border-base-300/80 hover:bg-base-content/6"
        :title="$t('home.openInLibrary')"
        @click="emit('open', item.tab)"
      >
        <span
          class="grid h-7 w-7 shrink-0 place-items-center rounded-field bg-base-100 text-base-content/80"
        >
          <component :is="item.icon" :size="14" :class="item.color" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-semibold leading-none tabular-nums text-base-content">
            {{ item.value }}
          </span>
          <span class="mt-0.5 block truncate text-[11px] text-base-content/50">
            {{ $t(item.key) }}
          </span>
        </span>
      </button>
    </div>
  </aside>
</template>
