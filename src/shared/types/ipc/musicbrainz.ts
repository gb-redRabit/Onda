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
  /** Relevance score returned by the search/autodetect endpoints. */
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
