// Czyste helpery responsywnych kontrolek wydzielone z
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
 * Prezentacja per wariant dla kontrolek transportu.
 *
 * Cztery pełne warianty — wide, tall, compact, minimal — były czterema niemal
 * identycznymi komponentami: te same osiem przycisków, te same handlery, te same
 * nazwy dostępności, różniące się jedynie kilkoma klasami Tailwind i tokenem
 * rozmiaru, z którego czytają ikony. Każda zmiana zachowania musiała być zrobiona
 * cztery razy, a zmiana w trzech z nich była niewidoczna, dopóki ktoś przypadkiem nie
 * zmienił rozmiaru okna. Teraz współdzielą jeden komponent i różnią się tylko wierszem poniżej.
 */
export interface ControlsDensity {
  /** Zewnętrzna kolumna. */
  container: string;
  /** Wiersz z przyciskami transportu. */
  transport: string;
  /** Padding na okrągłych przyciskach transportu. */
  button: string;
  /** Rozmycie halo za przyciskiem odtwarzania podczas grania. */
  glow: string;
  /** Wiersz z wyciszeniem i suwakiem głośności. */
  volumeRow: string;
  /** Wysokość paska głośności. */
  volumeTrack: string;
  /** Wiersz z przełącznikami equalizera i kolejki. */
  extrasRow: string;
  /** Wspólne klasy dla przełączników equalizera/kolejki. */
  extrasButton: string;
  /**
   * Czy wiersz transportu jest ukrywany, gdy box jest zbyt wąski, by się zmieścił.
   * Robi tak tylko minimal, i łączy się to z fallbackiem tylko-odtwarzanie; pozostałe
   * zawsze pokazują wiersz i polegają na tym, że box nigdy nie jest tak wąski.
   */
  gateTransportOnWidth: boolean;
  /**
   * Kiedy pokazać wiersz głośności. Pozostałe warianty pokazują go zawsze, gdy nie
   * jest compact; minimal pokazuje go tylko wtedy, gdy transport został odcięty,
   * bo oba nie mogą się zmieścić jednocześnie.
   */
  volume: 'whenNotCompact' | 'whenNarrow' | 'never';
  /** Wiersz equalizera/kolejki nie istnieje w minimal w ogóle. */
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
