import { ref, type Ref } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import type { AudioLayoutElement } from '@renderer/types/settings';

// Fullscreen-only element dragging: keeps a transient drag position and commits
// it to the audio layout on mouse-up.
export function useAudioElementDrag(isFullscreen: Ref<boolean>) {
  const settings = useSettingsStore();

  const dragging = ref<{
    id: string;
    startX: number;
    startY: number;
    elX: number;
    elY: number;
  } | null>(null);
  const dragPos = ref<{ id: string; x: number; y: number } | null>(null);

  function onElementMouseDown(e: MouseEvent, el: AudioLayoutElement) {
    if (!isFullscreen.value || el.id === 'visualization') return;
    e.preventDefault();
    e.stopPropagation();
    dragging.value = {
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      elX: el.x,
      elY: el.y
    };
  }

  function onDragMouseMove(e: MouseEvent) {
    if (!dragging.value) return;
    const canvas = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = ((e.clientX - dragging.value.startX) / canvas.width) * 100;
    const dy = ((e.clientY - dragging.value.startY) / canvas.height) * 100;
    const newX = Math.max(0, Math.min(100 - 5, Math.round(dragging.value.elX + dx)));
    const newY = Math.max(0, Math.min(100 - 5, Math.round(dragging.value.elY + dy)));
    dragPos.value = { id: dragging.value.id, x: newX, y: newY };
  }

  function onDragMouseUp() {
    if (dragging.value && dragPos.value) {
      const currentElements = settings.appearance.audioLayout?.elements ?? [];
      const updated = currentElements.map((el) =>
        el.id === dragPos.value!.id ? { ...el, x: dragPos.value!.x, y: dragPos.value!.y } : el
      );
      settings.updateAppearance({
        audioLayout: { ...settings.appearance.audioLayout, elements: updated }
      });
    }
    dragging.value = null;
    dragPos.value = null;
  }

  return { dragging, dragPos, onElementMouseDown, onDragMouseMove, onDragMouseUp };
}
