import type { AudioLayoutElement } from '@renderer/types/settings';

export function elementStyle(
  el: AudioLayoutElement,
  dragPos: { id: string; x: number; y: number } | null
): Record<string, string> {
  let { x, y } = el;
  if (dragPos?.id === el.id) {
    x = dragPos.x;
    y = dragPos.y;
  }
  const style: Record<string, string> = {
    left: x + '%',
    top: y + '%',
    width: el.width + '%',
    height: el.height + '%',
    opacity: String((el.opacity ?? 100) / 100),
    zIndex: String(el.layer * 10)
  };
  const bgOpacity = el.bgOpacity ?? 40;
  if (el.bg && bgOpacity > 0) {
    style.backgroundColor = `color-mix(in srgb, var(--color-base-300) ${bgOpacity}%, transparent)`;
    style.borderRadius = '0.5rem';
  }
  return style;
}
