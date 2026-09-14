export function mousePctInRect(e: MouseEvent, rect: DOMRect): { x: number; y: number } {
  return {
    x: ((e.clientX - rect.left) / rect.width) * 100,
    y: ((e.clientY - rect.top) / rect.height) * 100
  };
}

export function clampDragTarget(
  mousePct: { x: number; y: number },
  el: { width: number; height: number },
  grabOffset: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(100 - el.width, mousePct.x - grabOffset.x)),
    y: Math.max(0, Math.min(100 - el.height, mousePct.y - grabOffset.y))
  };
}
