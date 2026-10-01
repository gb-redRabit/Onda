export interface EdgePeekBoundsArgs {
  dock: 'top' | 'bottom' | 'left' | 'right';
  peeked: boolean;
  /** Width of the visible sliver when the window is hidden at the screen edge. */
  sliver: number;
  workArea: { x: number; y: number; width: number; height: number };
  size: { width: number; height: number };
}

/**
 * Bounds for an edge-docked PiP window. Shared by the peek/preview repositioning
 * and the regular `positionWindow` in `AudioPipManager` (plan 2.8).
 */
export function computeEdgePeekBounds(args: EdgePeekBoundsArgs): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const { dock, peeked, sliver, workArea, size } = args;
  let x = workArea.x;
  let y = workArea.y;
  if (dock === 'top') {
    x = workArea.x;
    y = peeked ? Math.round(workArea.y - (size.height - sliver)) : Math.round(workArea.y);
  } else if (dock === 'bottom') {
    x = workArea.x;
    y = peeked
      ? Math.round(workArea.y + workArea.height - sliver)
      : Math.round(workArea.y + workArea.height - size.height);
  } else if (dock === 'left') {
    y = workArea.y;
    x = peeked ? Math.round(workArea.x - (size.width - sliver)) : Math.round(workArea.x);
  } else {
    y = workArea.y;
    x = peeked
      ? Math.round(workArea.x + workArea.width - sliver)
      : Math.round(workArea.x + workArea.width - size.width);
  }
  return { x: Math.round(x), y: Math.round(y), width: size.width, height: size.height };
}
