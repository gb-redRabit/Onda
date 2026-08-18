import { screen } from 'electron';

export function computePipPosition(opts: {
  position?: string;
  width: number;
  height: number;
  workArea?: Electron.Rectangle;
}): { x: number; y: number; width: number; height: number } {
  const pos = opts.position || 'bottom-right';
  const workArea = opts.workArea || screen.getPrimaryDisplay().workArea;
  const margin = 20;
  const fullWidth = opts.width >= workArea.width;
  let x: number, y: number;

  switch (pos) {
    case 'bottom-left':
      x = workArea.x + margin;
      y = workArea.y + workArea.height - opts.height - margin;
      break;
    case 'bottom':
      x = fullWidth
        ? workArea.x
        : workArea.x + Math.max(margin, Math.round((workArea.width - opts.width) / 2));
      y = fullWidth
        ? workArea.y + workArea.height - opts.height
        : workArea.y + workArea.height - opts.height - margin;
      break;
    case 'top-right':
      x = workArea.x + workArea.width - opts.width - margin;
      y = workArea.y + margin;
      break;
    case 'top':
      x = fullWidth
        ? workArea.x
        : workArea.x + Math.max(margin, Math.round((workArea.width - opts.width) / 2));
      y = fullWidth ? workArea.y : workArea.y + margin;
      break;
    case 'top-left':
      x = workArea.x + margin;
      y = workArea.y + margin;
      break;
    default:
      x = workArea.x + workArea.width - opts.width - margin;
      y = workArea.y + workArea.height - opts.height - margin;
      break;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(opts.width),
    height: Math.round(opts.height)
  };
}
