interface MusicbrainzArtistCredit {
  name?: string;
  artist?: { name?: string };
}

export interface MusicbrainzRelease {
  id: string;
  title: string;
  date?: string;
  country?: string;
  'track-count'?: number;
  /** Wynik trafności zwracany przez endpointy wyszukiwania/autodetekcji. */
  score?: string;
  genres?: Array<{ name: string }>;
  'artist-credit'?: MusicbrainzArtistCredit[];
  media?: Array<{
    tracks: Array<{
      id?: string;
      number?: string;
      position?: string;
      title: string;
    }>;
  }>;
}
