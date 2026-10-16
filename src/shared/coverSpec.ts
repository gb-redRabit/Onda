import type { IpcCoverSpec } from './types/ipc';

// Jedno źródło prawdy dla budowy specyfikacji okładki z formularzy (dialog pobierania,
// subskrypcje, profil). Wcześniej istniały cztery kopie, które rozjeżdżały się na
// domyślnej klatce okładki (renderer `|| 0` vs main `30`).

/** Domyślny czas klatki (s) — zgodny z `normalizeCoverSpec` w procesie głównym. */
export const COVER_FRAME_DEFAULT = 30;
/** Domyślny koniec klipu okładki (s). */
export const COVER_CLIP_END_DEFAULT = 30;

export interface CoverSpecInput {
  type: 'none' | 'thumbnail' | 'custom' | 'frame' | 'clip';
  customPath?: string;
  frameTime?: number | string | null;
  clipStart?: number | string | null;
  clipEnd?: number | string | null;
  clipFormat?: 'webm' | 'mp4';
}

export interface CoverSpecDefaults {
  frameTime?: number;
  clipStart?: number;
  clipEnd?: number;
}

// Puste pole (''/null/undefined) traktujemy jak brak wartości → domyślna. Liczba 0
// jest wartością znaczącą (klatka 0 s), więc jej nie podmieniamy.
function finiteOr(value: number | string | null | undefined, fallback: number): number {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Buduje `IpcCoverSpec` z danych formularza. Zwraca `undefined`, gdy typ wymaga
 * parametru, którego brakuje (np. okładka „custom" bez ścieżki) — wywołujący wtedy
 * pomija okładkę zamiast wysyłać niepoprawną specyfikację.
 */
export function buildCoverSpec(
  input: CoverSpecInput,
  defaults: CoverSpecDefaults = {}
): IpcCoverSpec | undefined {
  switch (input.type) {
    case 'none':
      return { type: 'none' };
    case 'thumbnail':
      return { type: 'thumbnail' };
    case 'custom': {
      const path = (input.customPath ?? '').trim();
      return path ? { type: 'custom', customPath: path } : undefined;
    }
    case 'frame':
      return {
        type: 'frame',
        frameTime: finiteOr(input.frameTime, defaults.frameTime ?? COVER_FRAME_DEFAULT)
      };
    case 'clip':
      return {
        type: 'clip',
        clipStart: finiteOr(input.clipStart, defaults.clipStart ?? 0),
        clipEnd: finiteOr(input.clipEnd, defaults.clipEnd ?? COVER_CLIP_END_DEFAULT),
        clipFormat: input.clipFormat ?? 'webm'
      };
    default:
      return undefined;
  }
}
