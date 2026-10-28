import { ref, watch, type Ref } from 'vue';

interface VirtualGrid {
  cols: Ref<number>;
  update: () => void;
  observe: () => void;
  destroy: () => void;
}

export function useVirtualGrid(
  scrollRef: Ref<HTMLElement | null>,
  colWidth: number | (() => number),
  defaultCols = 6
): VirtualGrid {
  const cols = ref(defaultCols);
  let indexRowObserver: ResizeObserver | null = null;
  let stopWatch: ReturnType<typeof watch> | null = null;

  function resolveWidth(): number {
    return typeof colWidth === 'function' ? colWidth() : colWidth;
  }

  function update(): void {
    const el = scrollRef.value;
    if (!el) return;
    const width = resolveWidth();
    if (width <= 0) return;
    cols.value = Math.max(2, Math.floor(el.clientWidth / width));
  }

  function attachObserver(): void {
    indexRowObserver?.disconnect();
    indexRowObserver = null;
    const el = scrollRef.value;
    if (!el) return;
    indexRowObserver = new ResizeObserver(() => update());
    indexRowObserver.observe(el);
    update();
  }

  function observe(): void {
    // Kontener siatki jest w gałęzi `v-else` (domyślnie lista), więc w
    // `onMounted` jego ref bywa `null`. Obserwujemy ref, a nie tylko moment
    // montowania — po przełączeniu na siatkę obserwator podłącza się sam.
    attachObserver();
    if (!stopWatch) {
      stopWatch = watch(scrollRef, attachObserver, { flush: 'post' });
    }
  }

  function destroy(): void {
    stopWatch?.();
    stopWatch = null;
    indexRowObserver?.disconnect();
    indexRowObserver = null;
  }

  return { cols, update, observe, destroy };
}
