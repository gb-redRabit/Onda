<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComponentPublicInstance
} from 'vue';
import { ChevronRight } from '@lucide/vue';
import { useUIStore } from '@renderer/stores/ui';
import type { ContextMenuItem } from '@renderer/stores/ui';
import { CONTEXT_MENU_WIDTH } from '@renderer/stores/ui';

const ui = useUIStore();
const rootEl = ref<HTMLElement | null>(null);
const itemRefs = ref<Array<HTMLElement | null>>([]);
const openSubIndex = ref(-1);
const activeIndex = ref(-1);
const subStyle = ref<Record<string, string>>({});
const subSide = ref<'left' | 'right'>('right');
// Element, z którego otwarto menu (prawy przycisk lub przycisk `⋯`). Po Esc
// wracamy do niego fokusem, żeby klawiatura nie zostawała na ciele dokumentu.
const triggerEl = ref<HTMLElement | null>(null);
let openTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let typeAhead = '';
let typeAheadTimer: ReturnType<typeof setTimeout> | null = null;

function resetTypeAhead(): void {
  typeAhead = '';
  if (typeAheadTimer) {
    clearTimeout(typeAheadTimer);
    typeAheadTimer = null;
  }
}

const MENU_W = CONTEXT_MENU_WIDTH;
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
  subActiveIndex.value = -1;
  subItemRefs.value = [];
  submenuEl.value = null;
  subStyle.value = {};
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

async function openSub(idx: number, el: HTMLElement) {
  openSubIndex.value = idx;
  const rect = el.getBoundingClientRect();
  // Panel dostaje własny padding od strony menu (mostek hover), więc lewa
  // krawędź wrappera dotyka menu, a treść zaczyna się 4 px dalej.
  const openRight = rect.right + 4 + SUB_W <= window.innerWidth;
  subSide.value = openRight ? 'right' : 'left';
  const left = openRight ? rect.right : Math.max(4, rect.left - SUB_W - 4);
  // Wstępnie szacujemy, a po wyrenderowaniu mierzymy realną wysokość podmenu —
  // sztywne 320 px wypychało krótkie podmenu poza dolną krawędź.
  subStyle.value = {
    left: left + 'px',
    top: Math.max(4, Math.min(rect.top, window.innerHeight - 320 - 8)) + 'px'
  };
  await nextTick();
  const height = submenuEl.value?.getBoundingClientRect().height ?? 0;
  if (height > 0) {
    const top = Math.max(4, Math.min(rect.top, window.innerHeight - height - 8));
    subStyle.value = { left: left + 'px', top: top + 'px' };
  }
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
    openTimer = setTimeout(() => void openSub(idx, el), 120);
  } else if (openSubIndex.value >= 0) {
    // Przejście kursorem nad inną pozycją w drodze do podmenu nie może
    // zamykać panelu natychmiast — dopiero po chwili bez wejścia w podmenu.
    scheduleCloseSub(250);
  }
}

function onItemLeave() {
  // Samo opuszczenie pozycji nie zamyka podmenu: kursor musi przejść przez
  // kilkupikselową przerwę do teleportowanego panelu. Zamykamy dopiero po
  // wyjściu z całego menu/podmenu (onMenuLeave) albo wejściu w inną pozycję.
  if (openTimer) {
    clearTimeout(openTimer);
    openTimer = null;
  }
}

/** Wspólny „bezpieczny” czas na przejście między menu a podmenu. */
const MENU_CLOSE_DELAY_MS = 500;

function scheduleCloseSub(delay = MENU_CLOSE_DELAY_MS): void {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    closeTimer = null;
    // Kursor mógł już dojechać do podmenu (także w jego przezroczysty
    // mostek) — wtedy panel zostaje otwarty.
    if (submenuEl.value?.matches(':hover')) return;
    closeSub();
  }, delay);
}

function onMenuEnter(): void {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function onMenuLeave() {
  if (openTimer) {
    clearTimeout(openTimer);
    openTimer = null;
  }
  scheduleCloseSub();
}

function onSubEnter() {
  if (openTimer) {
    clearTimeout(openTimer);
    openTimer = null;
  }
  onMenuEnter();
}

function restoreFocus(): void {
  const el = triggerEl.value;
  triggerEl.value = null;
  if (el?.isConnected) el.focus();
}

function runAction(item: ContextMenuItem) {
  const trigger = triggerEl.value;
  ui.hideContextMenu();
  if (trigger?.isConnected) trigger.focus();
  item.action?.();
}

/** Indeksy pozycji, do których da się przenieść fokus strzałkami. */
function navigableIndexes(items: ContextMenuItem[] | undefined): number[] {
  return (items ?? []).map((it, i) => (it.separator || it.disabled ? -1 : i)).filter((i) => i >= 0);
}

// Fokus podmenu (klawiatura) — by trafić do niego strzałkami/Tabem.
const subItemRefs = ref<Array<HTMLElement | null>>([]);
const submenuEl = ref<HTMLElement | null>(null);

// `ref` wewnątrz `v-for` dawał tablicę; funkcja ustawia pojedynczy element
// aktualnie otwartego podmenu (tylko jedno jest renderowane).
function setSubmenuEl(el: Element | ComponentPublicInstance | null): void {
  submenuEl.value = (el as HTMLElement | null) ?? null;
}
const subActiveIndex = ref(-1);

function focusSubFirst(): void {
  nextTick(() => {
    const idx = navigableIndexes(ui.contextMenu?.items[openSubIndex.value]?.children)[0];
    if (idx === undefined) return;
    subActiveIndex.value = idx;
    subItemRefs.value[idx]?.focus();
  });
}

/** Otwiera podmenu wybranej pozycji i przenosi do niego fokus (ArrowRight/Enter). */
function openSubKeyboard(idx: number) {
  const el = itemRefs.value[idx];
  const item = ui.contextMenu?.items[idx];
  if (!el || !item?.children?.length) return;
  const first = navigableIndexes(item.children)[0];
  if (first === undefined) return;
  subActiveIndex.value = first;
  void openSub(idx, el);
  focusSubFirst();
}

function onSubKeydown(e: KeyboardEvent) {
  if (openSubIndex.value < 0) return;
  const parent = ui.contextMenu?.items[openSubIndex.value];
  const children = parent?.children ?? [];
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveSubActive(children, 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveSubActive(children, -1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    closeSub();
    itemRefs.value[openSubIndex.value >= 0 ? openSubIndex.value : activeIndex.value]?.focus();
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    const indexes = navigableIndexes(children);
    if (!indexes.length) return;
    const next = e.key === 'Home' ? indexes[0] : indexes[indexes.length - 1];
    subActiveIndex.value = next;
    subItemRefs.value[next]?.focus();
  }
}

function moveSubActive(children: ContextMenuItem[], dir: 1 | -1): void {
  const indexes = navigableIndexes(children);
  if (!indexes.length) return;
  const pos = indexes.indexOf(subActiveIndex.value);
  const next = indexes[(pos + dir + indexes.length) % indexes.length];
  subActiveIndex.value = next;
  subItemRefs.value[next]?.focus();
}

function selectableIndexes(): number[] {
  const items = ui.contextMenu?.items ?? [];
  // Pozycje z podmenu też są osiągalne z klawiatury (ArrowRight je otwiera),
  // więc nie wykluczamy ich z nawigacji strzałkami.
  return items.map((it, i) => (it.separator || it.disabled ? -1 : i)).filter((i) => i >= 0);
}

// Po otwarciu ustaw aktywnego kandydata i przenieś fokus do menu, żeby strzałki
// działały od razu (wcześniej fokus zostawał poza menu).
watch(
  () => ui.contextMenu,
  (menu) => {
    activeIndex.value = -1;
    closeSub();
    resetTypeAhead();
    if (!menu) return;
    const active = document.activeElement;
    triggerEl.value = active instanceof HTMLElement && active !== document.body ? active : null;
    nextTick(() => {
      const first = selectableIndexes()[0];
      activeIndex.value = first ?? -1;
      if (first !== undefined) itemRefs.value[first]?.focus();
    });
  }
);

function moveActive(dir: 1 | -1) {
  const indexes = selectableIndexes();
  if (!indexes.length) return;
  const pos = indexes.indexOf(activeIndex.value);
  const next = indexes[(pos + dir + indexes.length) % indexes.length];
  activeIndex.value = next;
  const el = itemRefs.value[next];
  el?.scrollIntoView({ block: 'nearest' });
}

/** Wyszukiwanie literą w menu (WAI-ARIA type-ahead). Zwraca true, gdy zużyto klawisz. */
function onTypeAhead(e: KeyboardEvent): boolean {
  if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (!/^[a-z0-9]$/i.test(e.key)) return false;
  typeAhead += e.key.toLowerCase();
  if (typeAheadTimer) clearTimeout(typeAheadTimer);
  typeAheadTimer = setTimeout(resetTypeAhead, 600);

  const inSub = openSubIndex.value >= 0;
  const items = inSub
    ? (ui.contextMenu?.items[openSubIndex.value]?.children ?? [])
    : (ui.contextMenu?.items ?? []);
  const indexes = navigableIndexes(items);
  const find = (needle: string): number | undefined =>
    indexes.find((i) => (items[i]?.label ?? '').toLowerCase().startsWith(needle));

  let match = find(typeAhead);
  if (match === undefined) {
    // Po zmianie litery zacznij od nowa, żeby „sa” po „s” nadal trafiało w „San”.
    typeAhead = e.key.toLowerCase();
    match = find(typeAhead);
  }
  if (match === undefined) return false;

  if (inSub) {
    subActiveIndex.value = match;
    subItemRefs.value[match]?.focus();
  } else {
    activeIndex.value = match;
    itemRefs.value[match]?.focus();
    itemRefs.value[match]?.scrollIntoView({ block: 'nearest' });
  }
  return true;
}

function onKeydown(e: KeyboardEvent) {
  if (!ui.contextMenu) return;
  if (e.key === 'Escape') {
    closeSub();
    ui.hideContextMenu();
    restoreFocus();
    return;
  }
  if (e.key === 'Tab') {
    // Zamykamy menu, ale nie blokujemy przejścia fokusu (to zachowanie Tab).
    closeSub();
    ui.hideContextMenu();
    return;
  }
  if (onTypeAhead(e)) {
    e.preventDefault();
    return;
  }
  // Gdy fokus jest w podmenu, obsługuje je onSubKeydown (także strzałki i Home/End).
  if (openSubIndex.value >= 0) {
    onSubKeydown(e);
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
  if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    const indexes = selectableIndexes();
    if (!indexes.length) return;
    const next = e.key === 'Home' ? indexes[0] : indexes[indexes.length - 1];
    activeIndex.value = next;
    itemRefs.value[next]?.focus();
    itemRefs.value[next]?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (e.key === 'ArrowRight' && activeIndex.value >= 0) {
    const item = ui.contextMenu.items[activeIndex.value];
    if (item?.children?.length) {
      e.preventDefault();
      openSubKeyboard(activeIndex.value);
    }
    return;
  }
  if (e.key === 'Enter' && activeIndex.value >= 0) {
    e.preventDefault();
    const item = ui.contextMenu.items[activeIndex.value];
    if (!item || item.disabled) return;
    // Pozycja z podmenu: otwórz je i przenieś fokus zamiast ignorować Enter.
    if (item.children?.length) openSubKeyboard(activeIndex.value);
    else runAction(item);
  }
}

function onClickOutside(e: MouseEvent) {
  if (!ui.contextMenu) return;
  const target = e.target as Node;
  // Podmenu jest teleportowane poza `rootEl`; bez tego klik w jego pozycję
  // zamykał menu na `mousedown` i akcja nigdy nie odpalała.
  if (rootEl.value?.contains(target) || submenuEl.value?.contains(target)) return;
  closeSub();
  ui.hideContextMenu();
}

function onScroll(e?: Event) {
  // Przewijanie samego menu (długie listy) i podmenu nie może go zamykać.
  const target = e?.target as Node | null;
  if (target && (rootEl.value?.contains(target) || submenuEl.value?.contains(target))) return;
  ui.hideContextMenu();
}

onMounted(() => {
  nextTick(() => {
    itemRefs.value = [];
  });
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('mousedown', onClickOutside);
  window.addEventListener('blur', onScroll);
  window.addEventListener('resize', onScroll);
  // Capture: przewijanie dowolnego kontenera (lista, panel) też zamyka menu.
  window.addEventListener('scroll', onScroll, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('mousedown', onClickOutside);
  window.removeEventListener('blur', onScroll);
  window.removeEventListener('resize', onScroll);
  window.removeEventListener('scroll', onScroll, true);
  // W przeciwnym razie timery hover przeżywają komponent: menu odmontowane
  // w trakcie otwierania podmenu zostawiało timeout sięgający później martwego refa.
  if (openTimer) clearTimeout(openTimer);
  if (closeTimer) clearTimeout(closeTimer);
  resetTypeAhead();
  openTimer = null;
  closeTimer = null;
});

function setRef(i: number) {
  return (el: unknown) => {
    itemRefs.value[i] = el as HTMLElement | null;
  };
}

function setSubRef(i: number) {
  return (el: unknown) => {
    subItemRefs.value[i] = el as HTMLElement | null;
  };
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="ui.contextMenu"
      id="context-menu"
      ref="rootEl"
      data-testid="context-menu"
      role="menu"
      class="fixed z-999 bg-neutral border border-neutral-content/20 rounded-box shadow-2xl shadow-scrim/50 py-1.5 min-w-45 max-h-[80vh] overflow-y-auto"
      :style="position"
      @click.stop
      @contextmenu.prevent
      @mouseenter="onMenuEnter()"
      @mouseleave="onMenuLeave()"
    >
      <template v-for="(item, idx) in ui.contextMenu.items" :key="idx">
        <div v-if="item.separator" class="border-t border-hairline my-1 mx-2" />
        <div
          v-else
          :ref="setRef(idx)"
          class="relative"
          :class="{ 'bg-primary/10': activeIndex === idx }"
          @mouseenter="onItemEnter(idx, $event.currentTarget as HTMLElement)"
          @mouseleave="onItemLeave()"
        >
          <button
            type="button"
            data-testid="context-menu-item"
            :role="item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'"
            :aria-checked="item.checked !== undefined ? item.checked : undefined"
            tabindex="-1"
            :aria-haspopup="item.children?.length ? 'menu' : undefined"
            :aria-expanded="item.children?.length ? openSubIndex === idx : undefined"
            class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-primary/10 hover:text-primary-text transition-colors"
            :class="{ 'opacity-40 pointer-events-none': item.disabled }"
            :disabled="item.disabled"
            @mousemove="activeIndex = idx"
            @click.stop="item.children?.length ? openSubKeyboard(idx) : runAction(item)"
          >
            <span v-if="item.icon" class="shrink-0 text-base-content/60">
              <component :is="item.icon" :size="14" />
            </span>
            <span class="flex-1 truncate">{{ item.label }}</span>
            <span v-if="item.checked" class="shrink-0 text-primary-text">✓</span>
            <span
              v-if="item.children?.length"
              class="shrink-0 text-base-content/50"
              :class="{ 'rotate-90': openSubIndex === idx }"
            >
              <ChevronRight :size="12" />
            </span>
            <span v-else-if="item.shortcut" class="text-2xs text-base-content/60 font-mono">{{
              item.shortcut
            }}</span>
          </button>

          <Teleport to="body">
            <div
              v-if="openSubIndex === idx && item.children?.length"
              id="context-submenu"
              :ref="setSubmenuEl"
              role="menu"
              class="fixed z-1000"
              :class="subSide === 'right' ? 'pl-1' : 'pr-1'"
              :style="subStyle"
              @mouseenter="onSubEnter()"
              @mouseleave="onMenuLeave()"
              @click.stop
              @contextmenu.prevent
            >
              <div
                class="bg-neutral border border-neutral-content/20 rounded-box shadow-2xl shadow-scrim/50 py-1.5 min-w-45 max-h-[80vh] overflow-y-auto"
              >
                <template v-for="(child, cidx) in item.children" :key="cidx">
                  <div v-if="child.separator" class="border-t border-hairline my-1 mx-2" />
                  <button
                    v-else
                    :ref="setSubRef(cidx)"
                    type="button"
                    data-testid="context-menu-subitem"
                    :role="child.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'"
                    :aria-checked="child.checked !== undefined ? child.checked : undefined"
                    tabindex="-1"
                    class="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-primary/10 hover:text-primary-text transition-colors"
                    :class="{ 'opacity-40 pointer-events-none': child.disabled }"
                    :disabled="child.disabled"
                    @mousemove="subActiveIndex = cidx"
                    @click.stop="runAction(child)"
                  >
                    <span v-if="child.icon" class="shrink-0 text-base-content/60">
                      <component :is="child.icon" :size="14" />
                    </span>
                    <span class="flex-1 truncate">{{ child.label }}</span>
                    <span v-if="child.checked" class="shrink-0 text-primary-text">✓</span>
                    <span v-if="child.shortcut" class="text-2xs text-base-content/60 font-mono">{{
                      child.shortcut
                    }}</span>
                  </button>
                </template>
              </div>
            </div>
          </Teleport>
        </div>
      </template>
    </div>
  </Teleport>
</template>
