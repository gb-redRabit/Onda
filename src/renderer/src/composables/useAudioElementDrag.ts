import { ref, type Ref } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { nudgeElement } from '@renderer/utils/audioLayoutNudge';
import type { AudioLayoutElement } from '@renderer/types/settings';

// Przeciąganie elementów tylko w pełnym ekranie: utrzymuje tymczasową pozycję przeciągania
// i zatwierdza ją w układzie audio przy puszczeniu myszy.
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

  function commitElementPosition(id: string, x: number, y: number): void {
    const currentElements = settings.appearance.audioLayout?.elements ?? [];
    const updated = currentElements.map((el) => (el.id === id ? { ...el, x, y } : el));
    settings.updateAppearance({
      audioLayout: { ...settings.appearance.audioLayout, elements: updated }
    });
  }

  function onDragMouseUp() {
    if (dragging.value && dragPos.value) {
      commitElementPosition(dragPos.value.id, dragPos.value.x, dragPos.value.y);
    }
    dragging.value = null;
    dragPos.value = null;
  }

  // Klawiatura: strzałki przesuwają zaznaczony element (Shift = skok 5%) — te same
  // ograniczenia co przeciąganie myszą (pełny ekran, poza wizualizacją).
  function onElementKeydown(e: KeyboardEvent, el: AudioLayoutElement): void {
    if (!isFullscreen.value || el.id === 'visualization') return;
    const next = nudgeElement(el, e.key, e.shiftKey);
    if (!next) return;
    e.preventDefault();
    if (next.x === el.x && next.y === el.y) return;
    commitElementPosition(el.id, next.x, next.y);
  }

  return {
    dragging,
    dragPos,
    onElementMouseDown,
    onDragMouseMove,
    onDragMouseUp,
    onElementKeydown
  };
}
