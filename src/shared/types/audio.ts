// Model parametrycznego korektora — wspólny dla renderera (silnik/UI) i ustawień (zapis).
export type EqBandType = 'lowshelf' | 'peaking' | 'highshelf';

export interface EqBand {
  type: EqBandType;
  /** Częstotliwość środkowa/odcięcia w Hz. */
  frequency: number;
  /** Dobroć (szerokość pasma); ignorowana dla półek. */
  q: number;
  /** Wzmocnienie w dB. */
  gain: number;
  /** Nachylenie półki (S) — tylko dla półek; 1 = najostrzejsze bez przesterowania. */
  slope?: number;
  /** Wyłączone pasmo jest pomijane (neutralne), ale zostaje na liście. Domyślnie włączone. */
  enabled?: boolean;
}
