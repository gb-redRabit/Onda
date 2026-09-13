export const ROOT_BG =
  'bg-[color-mix(in_srgb,var(--color-base-200)_var(--glass-alpha),transparent)] backdrop-blur-[var(--glass-blur)]';
export const EDGE_BORDER =
  'border-solid border-[color-mix(in_srgb,var(--color-base-content)_12%,transparent)]';

export const BTN =
  'inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-field)] border-0 bg-transparent p-0 font-inherit text-[11px] transition-all duration-100 text-[color-mix(in_srgb,var(--color-base-content)_70%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-base-content)_10%,transparent)] hover:text-[var(--color-base-content)] active:bg-[color-mix(in_srgb,var(--color-base-content)_18%,transparent)]';
export const BTN_PLAY =
  'inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 p-0 font-inherit text-[11px] transition-all duration-100 bg-[color-mix(in_srgb,var(--color-primary)_16%,transparent)] text-[var(--color-primary)] hover:bg-[color-mix(in_srgb,var(--color-primary)_35%,transparent)] hover:text-[var(--color-primary)] active:bg-[color-mix(in_srgb,var(--color-primary)_45%,transparent)]';
export const BTN_ACTIVE = 'text-[var(--color-primary)]!';

export const BTN_EDGE =
  'inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-field)] border-0 bg-transparent p-0 font-inherit text-[13px] transition-all duration-100 text-[color-mix(in_srgb,var(--color-base-content)_70%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-base-content)_10%,transparent)] hover:text-[var(--color-base-content)] active:bg-[color-mix(in_srgb,var(--color-base-content)_18%,transparent)]';
export const BTN_PLAY_EDGE =
  'inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 p-0 font-inherit text-[13px] transition-all duration-100 bg-[color-mix(in_srgb,var(--color-primary)_16%,transparent)] text-[var(--color-primary)] hover:bg-[color-mix(in_srgb,var(--color-primary)_35%,transparent)] hover:text-[var(--color-primary)] active:bg-[color-mix(in_srgb,var(--color-primary)_45%,transparent)]';

export const VOL_LABEL =
  'cursor-pointer rounded-[var(--radius-field)] px-0.5 py-0.5 text-[9px] text-base-content/70 hover:bg-base-content/10 hover:text-base-content';
export const EQ_BTN =
  'rounded-[var(--radius-field)] px-1 py-0.5 text-[8px] transition-colors text-base-content/70 hover:bg-base-content/10 hover:text-base-content';
export const EQ_BTN_ON = 'bg-primary text-primary-content';

export const PEEK_TRACK =
  'relative cursor-pointer bg-[color-mix(in_srgb,var(--color-base-content)_22%,transparent)]';
export const PEEK_FILL =
  'bg-[var(--color-primary)] transition-all duration-200 group-hover:brightness-125';

export const EDGE_PROGRESS_TRACK_H =
  'h-[4px] w-full shrink-0 cursor-pointer bg-[color-mix(in_srgb,var(--color-base-content)_22%,transparent)]';
export const EDGE_PROGRESS_TRACK_V =
  'relative h-full w-[4px] shrink-0 cursor-pointer bg-[color-mix(in_srgb,var(--color-base-content)_22%,transparent)]';
export const EDGE_PROGRESS_FILL_H =
  'h-full bg-primary transition-[width] group-hover:brightness-125';
export const EDGE_PROGRESS_FILL_V =
  'absolute bottom-0 left-0 w-full bg-primary transition-[height] group-hover:brightness-125';

export function pipRootClass(dock: string | null, peeked: boolean, edge: string | null): string {
  if (peeked && edge) return 'border-0 bg-transparent';
  const inner = (() => {
    switch (dock) {
      case 'top':
        return 'rounded-none border-x-0 border-t-0 border-b-[length:var(--border)]';
      case 'bottom':
        return 'rounded-none border-x-0 border-b-0 border-t-[length:var(--border)]';
      case 'left':
        return 'rounded-none border-y-0 border-l-0 border-r-[length:var(--border)]';
      case 'right':
        return 'rounded-none border-y-0 border-r-0 border-l-[length:var(--border)]';
      default:
        return 'rounded-[var(--radius-box)] border-[length:var(--border)]';
    }
  })();
  return `${ROOT_BG} ${EDGE_BORDER} ${inner}`;
}

export function pipPeekAlign(edge: string | null): string {
  switch (edge) {
    case 'top':
      return 'items-end';
    case 'bottom':
      return 'items-start';
    case 'left':
      return 'justify-end';
    case 'right':
      return 'justify-start';
    default:
      return '';
  }
}

export function pipPeekTrackGeom(edge: string | null): string {
  return edge === 'left' || edge === 'right' ? 'h-full w-[5px]' : 'h-[5px] w-full';
}

export function pipPeekFillGeom(edge: string | null): string {
  return edge === 'left' || edge === 'right' ? 'absolute bottom-0 left-0 w-full' : 'h-full';
}

export function pipPeekFillState(isPlaying: boolean): string {
  return isPlaying
    ? 'shadow-[0_0_8px_color-mix(in_srgb,var(--color-primary)_85%,transparent)]'
    : 'opacity-45';
}
