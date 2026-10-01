import { durMs } from './soundcloud-entries';
import { upgradeArtworkUrl } from './soundcloud-client';

interface ScTrackLike {
  id?: number | string | null;
  title?: string;
  duration?: number;
  artwork_url?: string | null;
  permalink_url?: string;
  user?: { permalink?: string; username?: string };
}

// Mapuje rozwiązany utwór SoundCloud na element `video` yt-resolve. Bez fallbacku
// awatara — brakująca okładka pokazuje placeholder karty, zamiast powtarzać
// obraz profilu.
export function mapScTrackItem(t: ScTrackLike, target: string) {
  const user = t.user || {};
  return {
    id: t.id != null ? String(t.id) : target,
    title: t.title || '',
    duration: durMs(t.duration),
    thumbnail: upgradeArtworkUrl(t.artwork_url),
    channelTitle: user.username || '',
    channelId: user.permalink || '',
    isPlayable: true,
    url: t.permalink_url || target
  };
}
