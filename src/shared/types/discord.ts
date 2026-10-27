export type PresenceKind = 'audio' | 'video' | 'stream';

/** Stan odtwarzania wysyłany z renderera do procesu głównego. */
export interface PresenceState {
  title: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  kind: PresenceKind;
  isPlaying: boolean;
  positionSec?: number;
  durationSec?: number;
}
