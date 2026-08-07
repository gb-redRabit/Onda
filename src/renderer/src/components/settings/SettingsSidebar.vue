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
  <aside class="w-72 border-r border-border-default shrink-0 flex flex-col bg-bg-surface/50">
    <div class="flex items-center justify-between px-4 pt-5 pb-4">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-accent-ghost flex items-center justify-center text-accent-base">
          <Settings :size="16" />
        </div>
        <h1 class="text-base font-bold tracking-tight">{{ $t('settings.title') }}</h1>
      </div>
      <button
        class="p-1.5 rounded-lg text-fg-faint hover:bg-bg-hover hover:text-fg-base transition-colors"
        :title="$t('settings.reset')"
        @click="emit('reset')"
      >
        <RotateCcw :size="14" />
      </button>
    </div>

    <div class="px-4 pb-4">
      <div class="relative">
        <Search
          :size="15"
          class="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint pointer-events-none"
        />
        <input
          :value="search"
          :placeholder="$t('settings.searchSettings')"
          class="w-full pl-9 pr-8 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm text-fg-base outline-none transition-all focus:border-accent-base/60 focus:ring-2 focus:ring-accent-base/15"
          @input="emit('updateSearch', ($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="search"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-fg-faint hover:text-fg-base transition-colors"
          @click="emit('updateSearch', '')"
        >
          <X :size="14" />
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-auto px-2 pb-4 space-y-6">
      <template v-if="query">
        <div class="space-y-1">
          <div v-if="!filteredTabs.length" class="px-3 py-3 text-xs text-fg-faint text-center">
            {{ $t('settings.noResults') }}
          </div>
          <button
            v-for="ft in filteredTabs"
            :key="ft.id"
            class="group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors"
            :class="tab === ft.id ? 'bg-accent-ghost' : 'hover:bg-bg-hover'"
            @click="pick(ft.id)"
          >
            <span
              class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-accent-base transition-opacity"
              :class="tab === ft.id ? 'opacity-100' : 'opacity-0'"
            />
            <component
              :is="ft.icon"
              :size="16"
              :class="tab === ft.id ? 'text-accent-base' : 'text-fg-faint group-hover:text-fg-base'"
            />
            <span
              class="min-w-0 truncate"
              :class="
                tab === ft.id
                  ? 'text-accent-base font-semibold'
                  : 'text-fg-muted group-hover:text-fg-base'
              "
            >{{ $t(ft.labelKey) }}</span>
          </button>
        </div>
      </template>

      <template v-for="section in sectionOrder" v-else :key="section.id">
        <div>
          <div class="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
            {{ $t(section.labelKey) }}
          </div>
          <div class="space-y-1">
            <button
              v-for="st in tabs.filter((tab) => tab.section === section.id)"
              :key="st.id"
              class="group relative flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors"
              :class="tab === st.id ? 'bg-accent-ghost' : 'hover:bg-bg-hover'"
              @click="pick(st.id)"
            >
              <span
                class="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-accent-base transition-opacity"
                :class="tab === st.id ? 'opacity-100' : 'opacity-0'"
              />
              <component
                :is="st.icon"
                :size="16"
                :class="
                  tab === st.id ? 'text-accent-base' : 'text-fg-faint group-hover:text-fg-base'
                "
              />
              <span
                class="min-w-0 truncate"
                :class="
                  tab === st.id
                    ? 'text-accent-base font-semibold'
                    : 'text-fg-muted group-hover:text-fg-base'
                "
              >{{ $t(st.labelKey) }}</span>
            </button>
          </div>
        </div>
      </template>
    </div>

    <div class="border-t border-border-default p-2.5 space-y-1">
      <button
        class="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-colors"
        @click="emit('export')"
      >
        <FileDown :size="16" />{{ $t('settings.export') }}
      </button>
      <button
        class="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-colors"
        @click="emit('import')"
      >
        <FileUp :size="16" />{{ $t('settings.import') }}
      </button>
    </div>
  </aside>
</template>
