import type { MediaFile } from '../media';
import type { EqBand } from '../audio';

export type CoreRepeat = 'none' | 'all' | 'one';

/**
 * Mały tick pozycji wysyłany 4×/s. Struktura (utwór, kolejka, historia) idzie
 * osobnym, pełnym snapshotem tylko wtedy, gdy faktycznie się zmieni — inaczej
 * kolejka 500 utworów jechałaby przez IPC cztery razy na sekundę.
 */
export interface CoreTickDto {
  revision: number;
  currentTime: number;
  duration: number;
  buffered: number;
  isPlaying: boolean;
  enginePlaying: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface CoreStateDto extends CoreTickDto {
  current: MediaFile | null;
  queue: MediaFile[];
  pendingQueue: MediaFile[];
  history: MediaFile[];
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: CoreRepeat;
  pipActive: boolean;
  pipTime: number;
}

export type CoreCommand =
  | {
      type: 'load';
      track: MediaFile;
      autoplay?: boolean;
      resume?: boolean;
      queue?: MediaFile[];
      pendingQueue?: MediaFile[];
    }
  | { type: 'setQueue'; queue: MediaFile[]; pendingQueue?: MediaFile[] }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'seek'; time: number }
  | { type: 'setVolume'; value: number }
  | { type: 'toggleMute' }
  | { type: 'toggleShuffle' }
  | { type: 'cycleRepeat' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'playFromHistory'; index: number }
  | { type: 'clear' }
  | { type: 'setPip'; active: boolean; time?: number }
  | { type: 'eqBands'; bands: EqBand[] }
  | { type: 'eqEnabled'; enabled: boolean }
  | { type: 'eqPreamp'; db: number }
  | { type: 'eqMono'; on: boolean }
  | { type: 'nightMode'; on: boolean }
  | { type: 'audioDelay'; ms: number }
  | { type: 'applyEqGraph'; bands: EqBand[] };

export interface CoreChannels {
  'core:getState': { args: []; result: CoreStateDto | null };
}
