// Klasyfikacja linków tylko dla SoundCloud. Międzyplatformowy dyspozytor żyje w
// platform.ts; ten plik nic nie wie o YouTube. Odbija semantykę
// shared/youtube.ts: klasyfikuje wklejony link jako utwór ('video'), set
// ('playlist') lub profil użytkownika ('channel'). Krótkie linki
// (on.soundcloud.com, snd.sc) są nieprzezroczyste — prowadzą do pojedynczego utworu.

export type ScKind = 'video' | 'playlist' | 'channel';

// Pierwsze segmenty ścieżki należące do stron serwisu SoundCloud, a nie do
// profili użytkowników — np. soundcloud.com/discover lub soundcloud.com/terms-of-use
// nigdy nie mogą być traktowane jako profil użytkownika o nazwie "discover".
const SC_RESERVED_SEGMENTS = new Set([
  'discover',
  'search',
  'upload',
  'you',
  'your',
  'following',
  'followers',
  'explore',
  'popular',
  'charts',
  'feed',
  'stream',
  'settings',
  'notifications',
  'messages',
  'terms-of-use',
  'terms',
  'privacy',
  'imprint',
  'legal',
  'help',
  'pages',
  'jobs',
  'press',
  'blog',
  'mobile',
  'developer',
  'logout',
  'login',
  'signup'
]);

interface ScParsedUrl {
  host: string;
  segments: string[];
}

function parseScUrl(input: string): ScParsedUrl | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host !== 'soundcloud.com' && host !== 'on.soundcloud.com' && host !== 'snd.sc') {
    return null;
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  return { host, segments };
}

export function isSoundcloudUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  return host === 'soundcloud.com' || host === 'on.soundcloud.com' || host === 'snd.sc';
}

// Klasyfikuje URL SoundCloud. Sam tekst nie ma tu znaczenia (id SC są
// numeryczne, a permalinki to słowa) — cokolwiek nie jest URL-em, daje null.
export function detectScKind(rawInput: string): ScKind | null {
  const input = rawInput.trim();
  if (!input) return null;
  const parsed = parseScUrl(input);
  if (!parsed) return null;

  // Nieprzezroczyste krótkie linki zawsze wskazują jeden utwór.
  if (parsed.host === 'on.soundcloud.com' || parsed.host === 'snd.sc') return 'video';

  const lower = parsed.segments.map((s) => s.toLowerCase());
  // /sets/ na dowolnej głębokości oznacza set (playlistę): /<user>/sets/<name>,
  // ale też spersonalizowane linki /discover/sets/<token> (które API odrzuca
  // czytelnym "not supported", zamiast traktować je jako śmieciowe wejście).
  const setIdx = lower.indexOf('sets');
  if (setIdx >= 1 && parsed.segments.length >= setIdx + 2) return 'playlist';

  const [first, second] = parsed.segments;
  if (!first || SC_RESERVED_SEGMENTS.has(first.toLowerCase())) return null;
  if (second && second.toLowerCase() === 'sets' && parsed.segments.length >= 3) return 'playlist';
  // /<user>/<track> → utwór; /<user> → profil.
  return parsed.segments.length === 1 ? 'channel' : 'video';
}

// Permalinki SC przechodzą bez zmian — API (i fallback yt-dlp) same rozwiązują
// krótkie linki. Zachowane dla symetrii z normalizeYtUrl.
export function normalizeScUrl(input: string): string {
  return input.trim();
}
