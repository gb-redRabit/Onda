export type SmartPlaylistField =
  | 'title'
  | 'artist'
  | 'album'
  | 'genre'
  | 'year'
  | 'duration'
  | 'bitrate'
  | 'lossless'
  | 'hasCover'
  | 'favorite'
  | 'playCount'
  | 'lastPlayed'
  | 'addedAt'
  | 'path';

export type SmartPlaylistOperator =
  | 'contains'
  | 'equals'
  | 'notEquals'
  | 'gte'
  | 'lte'
  | 'between'
  | 'isTrue'
  | 'isFalse'
  | 'withinLastDays'
  | 'olderThanDays'
  | 'never';

export type SmartPlaylistValue = string | number | boolean | [number, number];

export interface SmartPlaylistRule {
  field: SmartPlaylistField;
  operator: SmartPlaylistOperator;
  value: SmartPlaylistValue;
}

export type SmartPlaylistSort =
  'title' | 'artist' | 'album' | 'year' | 'duration' | 'addedAt' | 'lastPlayed' | 'playCount';

export interface SmartPlaylist {
  id: string;
  name: string;
  match: 'all' | 'any';
  rules: SmartPlaylistRule[];
  sort?: SmartPlaylistSort;
  sortDir?: 'asc' | 'desc';
  /** 0 / brak = bez limitu. */
  limit?: number;
  createdAt: number;
  updatedAt: number;
}
