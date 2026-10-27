export type PresenceKind = 'audio' | 'video' | 'stream';

/** Stan połączenia z lokalnym klientem Discorda (diagnostyka w ustawieniach). */
export interface DiscordStatus {
  enabled: boolean;
  connected: boolean;
  error: string | null;
}

/** Zapytanie o publiczną okładkę dla utworu lokalnego. */
export interface DiscordCoverQuery {
  artist?: string;
  title: string;
  album?: string;
}

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
