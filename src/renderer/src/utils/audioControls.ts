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
