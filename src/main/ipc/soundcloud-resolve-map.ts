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

// Maps a resolved SoundCloud track to a yt-resolve `video` item. No avatar
// fallback — a missing artwork shows the card placeholder instead of repeating
// the profile image.
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
