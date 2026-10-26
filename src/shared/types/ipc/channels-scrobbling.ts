export type ScrobblingService = 'lastfm' | 'listenbrainz';

/** Minimalny zestaw danych wysyłany z renderera do scrobblowania. */
export interface ScrobbleTrack {
  artist: string;
  title: string;
  album?: string;
  durationSec?: number;
  trackNumber?: number;
  /** Unix timestamp (sekundy) początku odtwarzania — używany przez Last.fm. */
  startedAt?: number;
}

export interface ScrobblingStatus {
  lastfm: {
    apiKey: boolean;
    apiSecret: boolean;
    session: boolean;
    enabled: boolean;
    username?: string;
  };
  listenbrainz: {
    token: boolean;
    enabled: boolean;
    username?: string;
  };
}

export interface ScrobblingTestResult {
  ok: boolean;
  username?: string;
  error?: string;
}

export interface ScrobblingAuthResult {
  ok: boolean;
  /** Opened in the system browser; user authorizes, then renderer polls complete. */
  error?: string;
}

export interface ScrobblingAuthCompleteResult {
  ok: boolean;
  sessionKey?: string;
  username?: string;
  error?: string;
}

export interface ScrobblingChannels {
  'scrobbling:status': { args: []; result: ScrobblingStatus };
  'scrobbling:test': { args: [service: ScrobblingService]; result: ScrobblingTestResult };
  'scrobbling:lastfmAuth': { args: []; result: ScrobblingAuthResult };
  'scrobbling:lastfmAuthComplete': { args: []; result: ScrobblingAuthCompleteResult };
  'scrobbling:nowPlaying': { args: [track: ScrobbleTrack]; result: void };
  'scrobbling:scrobble': { args: [track: ScrobbleTrack]; result: void };
}
