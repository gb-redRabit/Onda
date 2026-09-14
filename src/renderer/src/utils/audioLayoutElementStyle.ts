import type { AudioLayoutElement } from '@renderer/types/settings';

export function layoutEditorStyle(
  el: AudioLayoutElement,
  isDragging: boolean,
  dragPreview: { x: number; y: number } | null
): Record<string, string> {
  const x = isDragging && dragPreview ? dragPreview.x : el.x;
  const y = isDragging && dragPreview ? dragPreview.y : el.y;
  const style: Record<string, string> = {
    left: x + '%',
    top: y + '%',
    width: el.width + '%',
    height: el.height + '%',
    opacity: String((el.opacity ?? 100) / 100)
  };
  const bgOpacity = el.bgOpacity ?? 40;
  if (el.bg && bgOpacity > 0) {
    style.backgroundColor = `color-mix(in srgb, var(--color-base-300) ${bgOpacity}%, transparent)`;
  }
  return style;
}
