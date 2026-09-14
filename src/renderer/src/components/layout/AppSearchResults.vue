<script setup lang="ts">
import { Music2, Film, ListMusic, ArrowRight } from '@lucide/vue';
import type { FlatItem, SearchGroup } from '@renderer/utils/appSearch';

const props = defineProps<{
  groups: SearchGroup[];
  flatItems: FlatItem[];
  activeIndex: number;
}>();

const emit = defineEmits<{
  activate: [index: number];
  run: [item: FlatItem];
}>();

function indexOf(item: FlatItem): number {
  return props.flatItems.indexOf(item);
}
function isActive(item: FlatItem): boolean {
  return indexOf(item) === props.activeIndex;
}
</script>

<template>
  <div class="max-h-80 overflow-y-auto py-1">
    <template v-for="group in groups" :key="group.key">
      <div
        class="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-base-content/40"
      >
        {{ group.label }}
      </div>
      <template v-for="item in group.items" :key="item.label">
        <div
          v-if="item.type === 'track'"
          class="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm transition-colors"
          :class="isActive(item) ? 'bg-primary/10 text-primary' : 'hover:bg-base-content/10'"
          @click="emit('run', item)"
          @mouseenter="emit('activate', indexOf(item))"
        >
          <component
            :is="item.track.type === 'video' ? Film : Music2"
            :size="14"
            class="shrink-0 text-base-content/50"
          />
          <span class="truncate flex-1">{{ item.label }}</span>
          <span class="text-[11px] text-base-content/50 shrink-0 truncate max-w-30">{{
            item.sub
          }}</span>
        </div>
        <div
          v-else
          class="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm transition-colors"
          :class="isActive(item) ? 'bg-primary/10 text-primary' : 'hover:bg-base-content/10'"
          @click="emit('run', item)"
          @mouseenter="emit('activate', indexOf(item))"
        >
          <component
            :is="item.type === 'playlist' ? ListMusic : item.icon"
            :size="14"
            class="shrink-0 text-base-content/50"
          />
          <span>{{ item.label }}</span>
          <span v-if="item.type === 'playlist'" class="text-[11px] text-base-content/50 shrink-0">{{
            item.sub
          }}</span>
          <ArrowRight :size="12" class="ml-auto text-base-content/50" />
        </div>
      </template>
    </template>
    <div
      v-if="flatItems.length === 0"
      class="px-3 py-4 text-center text-xs text-base-content/50 italic"
    >
      {{ $t('cmdPalette.empty') }}
    </div>
  </div>
</template>
