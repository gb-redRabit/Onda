import type { MusicbrainzRelease } from '@shared/types/ipc';
import type { MediaFile } from '@renderer/types/media';

// Pure MusicBrainz lookup helpers extracted from
// `components/library/MusicBrainzLookup.vue` (plan 2.8).

export function buildMusicbrainzQuery(q: {
  artist: string;
  title: string;
  album: string;
  year: string;
}): string {
  const parts: string[] = [];
  const a = q.artist.trim();
  const t = q.title.trim();
  const al = q.album.trim();
  const y = q.year.trim();
  if (a) parts.push(`artist:"${a.replace(/"/g, '\\"')}"`);
  if (al) parts.push(`release:"${al.replace(/"/g, '\\"')}"`);
  if (t) parts.push(`"${t.replace(/"/g, '\\"')}"`);
  if (y) parts.push(`date:${y}`);
  if (parts.length === 0) return '';
  return parts.join(' AND ');
}

export function displayTrackNumber(
  track: { number?: string; position?: string },
  index: number
): number {
  return Number(track.number) || Number(track.position) || index + 1;
}

export interface MusicbrainzPreviewRow {
  key: string;
  label: string;
  old: string;
  now: string;
  checked: boolean;
}

export function buildPreviewRows(
  rel: (MusicbrainzRelease & { _coverData?: unknown }) | null,
  track: MediaFile | null,
  includeFields: Record<string, boolean>
): MusicbrainzPreviewRow[] {
  if (!rel) return [];
  const old = {
    title: track?.metadata?.title || track?.name || '',
    artist: track?.metadata?.artist || '',
    album: track?.metadata?.album || '',
    year: track?.metadata?.year?.toString() || '',
    genre: track?.metadata?.genre || '',
    track: track?.metadata?.track?.no?.toString() || '',
    cover: track ? '—' : ''
  };
  const now: Record<string, string> = {
    title: rel.media?.[0]?.tracks?.[0]?.title || '',
    artist: rel['artist-credit']?.[0]?.name || rel['artist-credit']?.[0]?.artist?.name || '',
    album: rel.title || '',
    year: rel.date ? rel.date.slice(0, 4) : '',
    genre: (rel as unknown as { genres?: { name: string }[] }).genres?.[0]?.name || '',
    track: '1',
    cover: rel._coverData ? 'okładka' : '—'
  };
  const labels: Record<string, string> = {
    title: 'Tytuł',
    artist: 'Artysta',
    album: 'Album',
    year: 'Rok',
    genre: 'Gatunek',
    track: 'Nr',
    cover: 'Okładka'
  };
  return (Object.keys(labels) as Array<keyof typeof labels>).map((k) => ({
    key: k,
    label: labels[k],
    old: (old as unknown as Record<string, string>)[k] || '—',
    now: now[k] || '—',
    checked: includeFields[k]
  }));
}
