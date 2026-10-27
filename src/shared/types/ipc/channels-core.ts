import type { MediaFile } from '../media';

/**
 * Minimalny kontrakt spike'u Fazy 1: ukryty Core odtwarza audio i publikuje stan,
 * a shell wysyła komendy. W Fazie 2 kontrakt rozrośnie się o kolejkę, historię,
 * EQ i wideo.
 */
export interface CoreStateDto {
  revision: number;
  current: MediaFile | null;
  /** Stan intencji playera (co użytkownik chce). */
  isPlaying: boolean;
  /** Rzeczywisty stan elementu audio (czy dźwięk leci). */
  enginePlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isLoading: boolean;
  error: string | null;
}

export type CoreCommand =
  | { type: 'load'; track: MediaFile; autoplay?: boolean }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'seek'; time: number }
  | { type: 'setVolume'; value: number }
  | { type: 'next' }
  | { type: 'prev' };

export interface CoreChannels {
  'core:getState': { args: []; result: CoreStateDto | null };
}
