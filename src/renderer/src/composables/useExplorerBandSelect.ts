import { ref } from 'vue';
import type { Ref } from 'vue';
import { useExplorerStore } from '@renderer/stores/explorer';

export interface BandRect {
  path: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function useExplorerBandSelect(
  scrollRef: Ref<HTMLDivElement | null>,
  explorer: ReturnType<typeof useExplorerStore>
) {
  const bandSelect = ref<{ left: number; top: number; width: number; height: number } | null>(null);
  const bandOrigin = ref<{ clientX: number; clientY: number } | null>(null);
  let bandRects: BandRect[] = [];
  let bandRafId: number | null = null;

  function onBandMouseDown(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button')) return;
    explorer.clearSelection();
    const rect = scrollRef.value?.getBoundingClientRect();
    if (!rect) return;
    bandOrigin.value = { clientX: e.clientX, clientY: e.clientY };
    bandSelect.value = { left: e.clientX, top: e.clientY, width: 0, height: 0 };
    bandRects = [];
    const buttons = scrollRef.value?.querySelectorAll('button[data-file-path]');
    buttons?.forEach((btn) => {
      const el = btn as HTMLButtonElement;
      const path = el.getAttribute('data-file-path');
      if (!path) return;
      const r = el.getBoundingClientRect();
      bandRects.push({ path, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    });
    document.addEventListener('mousemove', onBandMouseMove);
    document.addEventListener('mouseup', onBandMouseUp);
  }

  function onBandMouseMove(e: MouseEvent) {
    if (!bandOrigin.value || bandRafId !== null) return;
    const ox = bandOrigin.value.clientX;
    const oy = bandOrigin.value.clientY;
    const clientX = e.clientX;
    const clientY = e.clientY;
    bandRafId = requestAnimationFrame(() => {
      bandRafId = null;
      if (!bandOrigin.value) return;
      const sel = {
        left: Math.min(clientX, ox),
        top: Math.min(clientY, oy),
        width: Math.abs(clientX - ox),
        height: Math.abs(clientY - oy)
      };
      bandSelect.value = sel;
      explorer.clearSelection();
      for (const btn of bandRects) {
        const overlap = !(
          btn.right < sel.left ||
          btn.left > sel.left + sel.width ||
          btn.bottom < sel.top ||
          btn.top > sel.top + sel.height
        );
        if (overlap) explorer.selectedFiles.add(btn.path);
      }
    });
  }

  function onBandMouseUp() {
    if (bandRafId !== null) {
      cancelAnimationFrame(bandRafId);
      bandRafId = null;
    }
    bandRects = [];
    bandSelect.value = null;
    bandOrigin.value = null;
    document.removeEventListener('mousemove', onBandMouseMove);
    document.removeEventListener('mouseup', onBandMouseUp);
  }

  return { bandSelect, onBandMouseDown };
}
