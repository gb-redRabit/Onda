import type { MediaFile } from '../../shared/types/media';
import type {
  HistoryExportFormat,
  HistoryExportMediaType,
  HistoryExportSort
} from '../../shared/types/tools';

export interface HistoryRow {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  genre: string;
  year: string;
  type: string;
  durationSec: number;
  duration: string;
  path: string;
  playCount: number;
  lastPlayed: string;
  addedAt: string;
}

export interface HistoryFilterOptions {
  onlyPlayed: boolean;
  type: HistoryExportMediaType;
  sort: HistoryExportSort;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

export function buildHistoryRows(files: MediaFile[], options: HistoryFilterOptions): HistoryRow[] {
  const rows: HistoryRow[] = files
    .filter((file) => file.type === 'audio' || file.type === 'video')
    .filter((file) => options.type === 'all' || file.type === options.type)
    .filter((file) => !options.onlyPlayed || (file.playCount ?? 0) > 0)
    .map((file) => ({
      title: file.metadata?.title || file.name,
      artist: file.metadata?.artist || '',
      album: file.metadata?.album || '',
      albumArtist: file.metadata?.albumArtist || '',
      genre: file.metadata?.genre || '',
      year: file.metadata?.year ? String(file.metadata.year) : '',
      type: file.type,
      durationSec: Math.round(file.duration ?? 0),
      duration: formatDuration(file.duration ?? 0),
      path: file.path,
      playCount: file.playCount ?? 0,
      lastPlayed: file.lastPlayed ? new Date(file.lastPlayed).toISOString() : '',
      addedAt: file.addedAt ? new Date(file.addedAt).toISOString() : ''
    }));

  rows.sort((a, b) => {
    if (options.sort === 'playCount') {
      return b.playCount - a.playCount || a.title.localeCompare(b.title);
    }
    if (options.sort === 'title') return a.title.localeCompare(b.title);
    const aTime = a.lastPlayed ? Date.parse(a.lastPlayed) : 0;
    const bTime = b.lastPlayed ? Date.parse(b.lastPlayed) : 0;
    return bTime - aTime || a.title.localeCompare(b.title);
  });
  return rows;
}

function csvEscape(value: string | number): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializeHistory(rows: HistoryRow[], format: HistoryExportFormat): string {
  if (format === 'json') return `${JSON.stringify(rows, null, 2)}\n`;
  const header = [
    'title',
    'artist',
    'album',
    'albumArtist',
    'genre',
    'year',
    'type',
    'duration',
    'durationSec',
    'path',
    'playCount',
    'lastPlayed',
    'addedAt'
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.title,
        row.artist,
        row.album,
        row.albumArtist,
        row.genre,
        row.year,
        row.type,
        row.duration,
        row.durationSec,
        row.path,
        row.playCount,
        row.lastPlayed,
        row.addedAt
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  // BOM, żeby Excel poprawnie otwierał polskie znaki.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
