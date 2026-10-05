import { logger } from '@shared/logger';

// Zapamiętywanie/wznawianie pozycji odtwarzania per utwór, wyodrębnione z
// `audioEngine.ts`. Trzyma mapę w pamięci (sesyjną) i mostkuje do store procesu
// głównego (pozycje z wcześniejszych sesji). Nie zna elementu audio ani grafu —
// stosowanie pozycji robi fasadą silnika, która ma dostęp do `HTMLAudioElement`.

export class AudioEnginePositions {
  private readonly positions = new Map<string, number>();

  /** Zapisana pozycja z tej sesji (mapa w pamięci) lub 0. */
  get(path: string): number {
    return this.positions.get(path) ?? 0;
  }

  remember(path: string, position: number): void {
    this.positions.set(path, position);
  }

  /** Usuwa pozycję z mapy i ze store (best-effort). */
  clear(path: string): void {
    this.positions.delete(path);
    if (window.api?.clearPlaybackPosition) {
      void window.api.clearPlaybackPosition(path);
    } else {
      void window.api?.invoke('playback:clearPosition', path);
    }
  }

  clearAll(): void {
    this.positions.clear();
  }

  /** Trwale zapisuje pozycję (mapa + store). Wywoływane przy pauzie/postępie/zmianie. */
  persist(path: string, position: number): void {
    if (position <= 5) return;
    this.positions.set(path, position);
    if (window.api?.setPlaybackPosition) {
      void window.api.setPlaybackPosition(path, position);
    } else {
      void window.api?.invoke('playback:setPosition', path, position);
    }
  }

  /** Odczytuje zapisaną pozycję ze store i zapamiętuje ją w mapie sesyjnej. */
  async restore(path: string): Promise<number> {
    try {
      const position = (await window.api?.getPlaybackPosition(path)) || 0;
      if (position > 0) this.positions.set(path, position);
      return position;
    } catch (e) {
      logger.warn('audio', 'restore saved position failed', e);
      return 0;
    }
  }
}
