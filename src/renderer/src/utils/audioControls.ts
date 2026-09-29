// Pure responsive-control helpers extracted from
// `components/audio/AudioControls.vue` (plan 2.8).

export type LayoutMode = 'wide' | 'compact' | 'tall' | 'minimal' | 'micro';

export const ICON = { wide: 18, compact: 14, tall: 16, minimal: 12, micro: 11 } as const;
export const ICON_SM = { wide: 16, compact: 12, tall: 14, minimal: 10, micro: 9 } as const;
export const PLAY_SIZE = { wide: 22, compact: 18, tall: 20, minimal: 14, micro: 13 } as const;
export const PLAY_BOX = {
  wide: 'w-12 h-12',
  compact: 'w-9 h-9',
  tall: 'w-10 h-10',
  minimal: 'w-7 h-7',
  micro: 'w-6 h-6'
} as const;

export function calcMode(w: number, h: number): LayoutMode {
  if (h < 28) return 'micro';
  if (w >= 280 && h >= 120) return 'wide';
  if (w >= 180 && h >= 100) return 'compact';
  if (h >= 140) return 'tall';
  return 'minimal';
}

/**
 * Per-variant presentation for the transport controls.
 *
 * The four full variants — wide, tall, compact, minimal — were four near-identical
 * components: the same eight buttons, the same handlers, the same accessible
 * names, differing only in a handful of Tailwind classes and which size token the
 * icons read from. Every behavioural change had to be made four times, and a
 * change made in three of them was invisible until someone happened to resize the
 * window. They now share one component and differ only by the row below.
 */
export interface ControlsDensity {
  /** Outer column. */
  container: string;
  /** Row holding the transport buttons. */
  transport: string;
  /** Padding on the round transport buttons. */
  button: string;
  /** Blur on the halo behind the play button while playing. */
  glow: string;
  /** Row holding mute and the volume slider. */
  volumeRow: string;
  /** Height of the volume track. */
  volumeTrack: string;
  /** Row holding the equalizer and queue toggles. */
  extrasRow: string;
  /** Shared classes for the equalizer/queue toggles. */
  extrasButton: string;
  /**
   * Whether the transport row is hidden when the box is too narrow to fit it.
   * Only minimal does this, and it pairs with the play-only fallback; the others
   * always show the row and rely on the box never being that narrow.
   */
  gateTransportOnWidth: boolean;
  /**
   * When to show the volume row. The other variants show it whenever not
   * compact; minimal shows it only when the transport was gated away, because
   * the two cannot both fit.
   */
  volume: 'whenNotCompact' | 'whenNarrow' | 'never';
  /** The equalizer/queue row does not exist in minimal at all. */
  extras: boolean;
}

export const DENSITY: Record<Exclude<LayoutMode, 'micro'>, ControlsDensity> = {
  wide: {
    container: 'flex flex-col items-center justify-center gap-2 w-full h-full px-3 py-2',
    transport: 'flex items-center justify-center gap-4',
    button: 'p-2',
    glow: 'blur-xl',
    volumeRow: 'flex items-center justify-center gap-2 w-full max-w-[220px]',
    volumeTrack: 'h-1',
    extrasRow: 'flex items-center justify-center gap-2',
    extrasButton:
      'fx-noise flex items-center gap-1.5 px-3 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors',
    gateTransportOnWidth: false,
    volume: 'whenNotCompact',
    extras: true
  },
  tall: {
    container: 'flex flex-col items-center justify-center gap-2.5 w-full h-full px-1 py-2',
    transport: 'flex items-center justify-center gap-2.5',
    button: 'p-1.5',
    glow: 'blur-xl',
    volumeRow: 'flex items-center gap-1.5 w-full max-w-[140px]',
    volumeTrack: 'h-1',
    extrasRow: 'flex items-center justify-center gap-1',
    extrasButton:
      'fx-noise flex items-center gap-1 px-2 py-0.5 fx-depth rounded-field text-[10px] font-medium transition-colors',
    gateTransportOnWidth: false,
    volume: 'whenNotCompact',
    extras: true
  },
  compact: {
    container: 'flex flex-col items-center justify-center gap-1.5 w-full h-full px-2 py-1',
    transport: 'flex items-center justify-center gap-2',
    button: 'p-1.5',
    glow: 'blur-lg',
    volumeRow: 'flex items-center justify-center gap-1.5 w-full max-w-[160px]',
    volumeTrack: 'h-1',
    extrasRow: 'flex items-center justify-center gap-1',
    extrasButton:
      'fx-noise flex items-center gap-1 px-2 py-0.5 fx-depth rounded-field text-[10px] font-medium transition-colors',
    gateTransportOnWidth: false,
    volume: 'whenNotCompact',
    extras: true
  },
  minimal: {
    container: 'flex flex-col items-center justify-center gap-0.5 w-full h-full overflow-hidden',
    transport: 'flex items-center justify-center gap-1.5 shrink-0',
    button: 'p-1',
    glow: 'blur-md',
    volumeRow: 'flex items-center gap-1 w-full max-w-[90px] px-1 justify-center shrink-0',
    volumeTrack: 'h-0.5',
    extrasRow: '',
    extrasButton: '',
    gateTransportOnWidth: true,
    volume: 'whenNarrow',
    extras: false
  }
};
