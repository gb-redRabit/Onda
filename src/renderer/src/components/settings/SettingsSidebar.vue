<script setup lang="ts">
import { RotateCcw, Search, FileDown, FileUp, X, Settings } from '@lucide/vue';
import type { Component } from 'vue';

defineProps<{
  tab: string;
  search: string;
  query: string;
  tabs: {
    id: string;
    labelKey: string;
    icon: Component;
    section: string;
  }[];
  filteredTabs: {
    id: string;
    labelKey: string;
    icon: Component;
    section: string;
  }[];
  sectionOrder: { id: string; labelKey: string }[];
}>();

const emit = defineEmits<{
  select: [id: string];
  updateSearch: [value: string];
  reset: [];
  export: [];
  import: [];
}>();

function pick(id: string) {
  emit('select', id);
}
</script>

<template>
  <aside class="w-72 border-r border-border-default shrink-0 flex flex-col bg-bg-surface/60">
    <div class="flex items-center justify-between px-5 pt-6 pb-5">
      <div class="flex items-center gap-3">
        <div
          class="w-9 h-9 rounded-xl bg-accent-base/15 flex items-center justify-center text-accent-base ring-1 ring-accent-base/20"
        >
          <Settings :size="17" />
        </div>
        <div>
          <h1 class="text-sm font-bold tracking-tight leading-none">{{ $t('settings.title') }}</h1>
          <p class="text-[11px] text-fg-faint mt-1">{{ $t('settings.searchSettings') }}</p>
        </div>
      </div>
      <button
        class="p-2 rounded-lg text-fg-faint hover:bg-bg-hover hover:text-fg-base transition-colors"
        :title="$t('settings.reset')"
        :aria-label="$t('settings.reset')"
        @click="emit('reset')"
      >
        <RotateCcw :size="14" />
      </button>
    </div>

    <div class="px-4 pb-5">
      <div class="relative">
        <Search
          :size="15"
          class="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-faint pointer-events-none"
        />
        <input
          :value="search"
          :placeholder="$t('settings.searchSettings')"
          class="w-full pl-10 pr-9 py-2.5 rounded-full bg-bg-elevated/80 border border-border-default text-sm text-fg-base outline-none transition-all placeholder:text-fg-faint focus:border-accent-base/50 focus:ring-4 focus:ring-accent-base/10"
          @input="emit('updateSearch', ($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="search"
          class="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
          :aria-label="$t('common.close')"
          @click="emit('updateSearch', '')"
        >
          <X :size="14" />
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-auto px-3 pb-4 space-y-6">
      <template v-if="query">
        <div class="space-y-1">
          <div v-if="!filteredTabs.length" class="px-3 py-6 text-xs text-fg-faint text-center">
            {{ $t('settings.noResults') }}
          </div>
          <button
            v-for="ft in filteredTabs"
            :key="ft.id"
            class="group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors"
            :class="
              tab === ft.id
                ? 'bg-accent-base text-white shadow-lg shadow-accent-base/20'
                : 'text-fg-muted hover:bg-bg-hover hover:text-fg-base'
            "
            @click="pick(ft.id)"
          >
            <component
              :is="ft.icon"
              :size="16"
              class="shrink-0 transition-colors"
              :class="tab === ft.id ? 'text-white' : 'text-fg-faint group-hover:text-fg-base'"
            />
            <span class="min-w-0 truncate">{{ $t(ft.labelKey) }}</span>
          </button>
        </div>
      </template>

      <template v-for="section in sectionOrder" v-else :key="section.id">
        <div>
          <div
            class="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-faint/80"
          >
            {{ $t(section.labelKey) }}
          </div>
          <div class="space-y-0.5">
            <button
              v-for="st in tabs.filter((tab) => tab.section === section.id)"
              :key="st.id"
              class="group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors"
              :class="
                tab === st.id
                  ? 'bg-accent-base text-white shadow-lg shadow-accent-base/20'
                  : 'text-fg-muted hover:bg-bg-hover hover:text-fg-base'
              "
              @click="pick(st.id)"
            >
              <component
                :is="st.icon"
                :size="16"
                class="shrink-0 transition-colors"
                :class="tab === st.id ? 'text-white' : 'text-fg-faint group-hover:text-fg-base'"
              />
              <span class="min-w-0 truncate">{{ $t(st.labelKey) }}</span>
            </button>
          </div>
        </div>
      </template>
    </div>

    <div class="border-t border-border-default p-3 grid grid-cols-2 gap-2">
      <button
        class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-fg-muted bg-bg-elevated/60 border border-border-default hover:bg-bg-hover hover:text-fg-base transition-colors"
        @click="emit('export')"
      >
        <FileDown :size="14" />{{ $t('settings.export') }}
      </button>
      <button
        class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-fg-muted bg-bg-elevated/60 border border-border-default hover:bg-bg-hover hover:text-fg-base transition-colors"
        @click="emit('import')"
      >
        <FileUp :size="14" />{{ $t('settings.import') }}
      </button>
    </div>
  </aside>
</template>
