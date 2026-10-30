<script setup lang="ts">
import { nextTick } from 'vue';
import type { LibraryTab, TabId } from '@renderer/utils/libraryTabs';

// Pasek zakładek. O tym, co się mieści, decydują container queries (patrz
// <style>): najpierw znikają liczniki, potem ikony, na końcu etykiety. Dzięki
// temu etykiety nigdy nie są ucinane wielokropkiem niezależnie od szerokości
// okna, zwinięcia sidebara i języka.
const props = defineProps<{
  tabs: readonly LibraryTab[];
  modelValue: TabId;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: TabId];
}>();

// Wzorzec WAI-ARIA tabs: strzałki/Home/End przenoszą focus (roving tabindex) i wybór.
function onTabKeydown(e: KeyboardEvent, index: number): void {
  const n = props.tabs.length;
  let next = index;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % n;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + n) % n;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = n - 1;
  else return;
  e.preventDefault();
  emit('update:modelValue', props.tabs[next]!.id);
  const row = (e.currentTarget as HTMLElement).parentElement;
  nextTick(() => row?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus());
}
</script>

<template>
  <div class="tab-shell relative" role="tablist" :aria-label="$t('library.title')">
    <div
      class="tab-row flex gap-1 rounded-box border border-base-300/70 bg-base-200/75 p-1 overflow-x-auto overflow-y-hidden"
    >
      <button
        v-for="(tabItem, i) in props.tabs"
        :id="'library-tab-' + tabItem.id"
        :key="tabItem.id"
        role="tab"
        data-tab
        :data-testid="'library-tab-' + tabItem.id"
        :aria-controls="'library-panel-' + tabItem.id"
        :aria-selected="props.modelValue === tabItem.id"
        :tabindex="props.modelValue === tabItem.id ? 0 : -1"
        :aria-label="tabItem.label"
        class="group flex flex-1 min-w-max items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 h-8 rounded-field text-xs font-medium transition-all duration-150"
        :class="
          props.modelValue === tabItem.id
            ? 'bg-primary/18 text-base-content shadow-xs ring-1 ring-primary/30 flex-[1.2]'
            : 'text-base-content/65 hover:bg-base-content/7 hover:text-base-content'
        "
        :title="tabItem.label + ' (' + tabItem.count + ')'"
        @click="emit('update:modelValue', tabItem.id)"
        @keydown="onTabKeydown($event, i)"
      >
        <span data-tab-icon class="inline-flex shrink-0">
          <component
            :is="tabItem.icon"
            :size="14"
            :class="
              props.modelValue === tabItem.id
                ? 'text-primary-text'
                : 'opacity-65 group-hover:opacity-100 group-focus-within:opacity-100'
            "
          />
        </span>
        <span data-tab-label class="truncate">{{ tabItem.label }}</span>
        <span
          data-tab-count
          class="ml-0.5 px-1.5 py-0.5 rounded-full text-3xs font-semibold leading-none tabular-nums shrink-0"
          :class="
            props.modelValue === tabItem.id
              ? 'bg-primary/20 text-primary-text'
              : 'bg-base-300/80 text-base-content/55'
          "
          >{{ tabItem.count }}</span
        >
      </button>
    </div>
  </div>
</template>

<style scoped>
/* `container-type` na opakowaniu: zapytania mierzą realną szerokość paska
   (a nie okna), więc zwinięcie sidebara od razu przełącza tryb. */
.tab-shell {
  container-type: inline-size;
}

.tab-row {
  scrollbar-width: none;
}
.tab-row::-webkit-scrollbar {
  display: none;
}

/* Priorytet: pełny pasek → bez liczników → bez ikon → same ikony.
   `display: none` (a nie `visibility`) jest konieczne: ukryty element musi
   oddać miejsce, inaczej etykiety nadal się ucinały. Progi są dobrane pod
   najdłuższe polskie etykiety, a `min-w-max` na zakładce gwarantuje, że przy
   szerszym kroju pisma pasek przewinie się zamiast ucinać tekst. */
@container (max-width: 1100px) {
  [data-tab-count] {
    display: none;
  }
}

@container (max-width: 900px) {
  [data-tab-icon] {
    display: none;
  }
}

@container (max-width: 700px) {
  [data-tab-label] {
    display: none;
  }

  [data-tab] {
    flex: 0 0 2.5rem;
    min-width: 0;
  }
}
</style>
