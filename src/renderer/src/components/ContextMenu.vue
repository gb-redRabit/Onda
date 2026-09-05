<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { ChevronRight } from '@lucide/vue';
import { useUIStore } from '@renderer/stores/ui';
import type { ContextMenuItem } from '@renderer/stores/ui';

const ui = useUIStore();
const rootEl = ref<HTMLElement | null>(null);
const itemRefs = ref<Array<HTMLElement | null>>([]);
const openSubIndex = ref(-1);
const activeIndex = ref(-1);
const subStyle = ref<Record<string, string>>({});
let openTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

const MENU_W = 230;
const ITEM_H = 34;
const SUB_W = 240;

const position = computed(() => {
  const m = ui.contextMenu;
  if (!m) return {};
  const estimatedH = m.items.length * ITEM_H + 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x = Math.min(m.x, vw - MENU_W - 8);
  const y = Math.min(m.y, vh - estimatedH - 8);
  return { left: Math.max(8, x) + 'px', top: Math.max(8, y) + 'px', maxHeight: vh - 16 + 'px' };
});

function closeSub() {
  openSubIndex.value = -1;
  subStyle.value = {};
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function openSub(idx: number, el: HTMLElement) {
  openSubIndex.value = idx;
  const rect = el.getBoundingClientRect();
  const left =
    rect.right + 8 < window.innerWidth ? rect.right + 8 : Math.max(4, rect.left - SUB_W - 8);
  const top = Math.min(rect.top, window.innerHeight - 320 - 8);
  subStyle.value = { left: left + 'px', top: Math.max(4, top) + 'px' };
}

function onItemEnter(idx: number, el: HTMLElement) {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  if (openTimer) {
    clearTimeout(openTimer);
  }
  const item = ui.contextMenu?.items[idx];
  if (item?.children?.length) {
    openTimer = setTimeout(() => openSub(idx, el), 120);
  } else {
    closeSub();
  }
}

function onItemLeave() {
  if (openTimer) {
    clearTimeout(openTimer);
    openTimer = null;
  }
  closeTimer = setTimeout(closeSub, 160);
}

function onSubEnter() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function runAction(item: ContextMenuItem) {
  ui.hideContextMenu();
  item.action?.();
}

function selectableIndexes(): number[] {
  const items = ui.contextMenu?.items ?? [];
  return items
    .map((it, i) => (it.separator || it.disabled || it.children?.length ? -1 : i))
    .filter((i) => i >= 0);
}

function moveActive(dir: 1 | -1) {
  const indexes = selectableIndexes();
  if (!indexes.length) return;
  const pos = indexes.indexOf(activeIndex.value);
  const next = indexes[(pos + dir + indexes.length) % indexes.length];
  activeIndex.value = next;
  const el = itemRefs.value[next];
  el?.scrollIntoView({ block: 'nearest' });
}

function onKeydown(e: KeyboardEvent) {
  if (!ui.contextMenu) return;
  if (e.key === 'Escape') {
    closeSub();
    ui.hideContextMenu();
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveActive(1);
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveActive(-1);
    return;
  }
  if (e.key === 'Enter' && activeIndex.value >= 0) {
    e.preventDefault();
    const item = ui.contextMenu.items[activeIndex.value];
    if (item && !item.disabled && !item.children?.length) runAction(item);
  }
}

function onClickOutside(e: MouseEvent) {
  if (!ui.contextMenu) return;
  const target = e.target as Node;
  if (!rootEl.value?.contains(target)) {
    closeSub();
    ui.hideContextMenu();
  }
}

function onScroll() {
  ui.hideContextMenu();
}

onMounted(() => {
  nextTick(() => {
    itemRefs.value = [];
  });
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('mousedown', onClickOutside);
  window.addEventListener('blur', onScroll);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('mousedown', onClickOutside);
  window.removeEventListener('blur', onScroll);
});

function setRef(i: number) {
  return (el: unknown) => {
    itemRefs.value[i] = el as HTMLElement | null;
  };
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="ui.contextMenu"
      id="context-menu"
      ref="rootEl"
      class="fixed z-999 bg-neutral border border-neutral-content/20 rounded-box shadow-2xl shadow-black/50 py-1.5 min-w-45 max-h-[80vh] overflow-y-auto"
      :style="position"
      @click.stop
      @contextmenu.prevent
      @mouseleave="onItemLeave()"
    >
      <template v-for="(item, idx) in ui.contextMenu.items" :key="idx">
        <div v-if="item.separator" class="border-t border-base-300 my-1 mx-2" />
        <div
          v-else
          :ref="setRef(idx)"
          class="relative"
          :class="{ 'bg-primary/10': activeIndex === idx }"
          @mouseenter="onItemEnter(idx, $event.currentTarget as HTMLElement)"
          @mouseleave="onItemLeave()"
        >
          <button
            class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors"
            :class="{ 'opacity-40 pointer-events-none': item.disabled }"
            :disabled="item.disabled"
            @mousemove="activeIndex = idx"
            @click.stop="item.children?.length ? undefined : runAction(item)"
          >
            <span v-if="item.icon" class="shrink-0 text-base-content/60">
              <component :is="item.icon" :size="14" />
            </span>
            <span class="flex-1 truncate">{{ item.label }}</span>
            <span
              v-if="item.children?.length"
              class="shrink-0 text-base-content/50"
              :class="{ 'rotate-90': openSubIndex === idx }"
            >
              <ChevronRight :size="12" />
            </span>
            <span v-else-if="item.shortcut" class="text-[10px] text-base-content/60 font-mono">{{
              item.shortcut
            }}</span>
          </button>

          <Teleport to="body">
            <div
              v-if="openSubIndex === idx && item.children?.length"
              class="fixed z-1000 bg-neutral border border-neutral-content/20 rounded-box shadow-2xl shadow-black/50 py-1.5 min-w-45 max-h-[80vh] overflow-y-auto"
              :style="subStyle"
              @mouseenter="onSubEnter()"
              @mouseleave="onItemLeave()"
              @click.stop
              @contextmenu.prevent
            >
              <template v-for="(child, cidx) in item.children" :key="cidx">
                <div v-if="child.separator" class="border-t border-base-300 my-1 mx-2" />
                <button
                  v-else
                  class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors"
                  :class="{ 'opacity-40 pointer-events-none': child.disabled }"
                  :disabled="child.disabled"
                  @click.stop="runAction(child)"
                >
                  <span v-if="child.icon" class="shrink-0 text-base-content/60">
                    <component :is="child.icon" :size="14" />
                  </span>
                  <span class="flex-1 truncate">{{ child.label }}</span>
                  <span v-if="child.shortcut" class="text-[10px] text-base-content/60 font-mono">{{
                    child.shortcut
                  }}</span>
                </button>
              </template>
            </div>
          </Teleport>
        </div>
      </template>
    </div>
  </Teleport>
</template>