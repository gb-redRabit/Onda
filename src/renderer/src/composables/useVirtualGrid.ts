import { ref, type Ref } from 'vue';

interface VirtualGrid {
  cols: Ref<number>;
  update: () => void;
  observe: () => void;
  destroy: () => void;
}

export function useVirtualGrid(
  scrollRef: Ref<HTMLElement | null>,
  colWidth: number,
  defaultCols = 6
): VirtualGrid {
  const cols = ref(defaultCols);
  let indexRowObserver: ResizeObserver | null = null;

  function update(): void {
    const el = scrollRef.value;
    if (!el) return;
    cols.value = Math.max(2, Math.floor(el.clientWidth / colWidth));
  }

  function observe(): void {
    indexRowObserver?.disconnect();
    const el = scrollRef.value;
    if (!el) return;
    indexRowObserver = new ResizeObserver(() => update());
    indexRowObserver.observe(el);
    update();
  }

  function destroy(): void {
    indexRowObserver?.disconnect();
    indexRowObserver = null;
  }

  return { cols, update, observe, destroy };
}
