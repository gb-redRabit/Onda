import type { YouTubeResolveKind } from './types/online';

// Klasyfikuje link wklejony przez użytkownika jako pojedyncze wideo, playlistę lub kanał.
// Akceptuje pełne URL-e oraz same klucze: 11-znakowy identyfikator wideo i
// uchwyt kanału z (@MrMoMMusic) lub bez (MrMoMMusic) wiodącego @.
// Zwraca null dla wszystkiego, co nie jest rozpoznawalnym linkiem YouTube.
export function detectYtKind(rawInput: string): YouTubeResolveKind | null {
  const input = rawInput.trim();
  if (!input) return null;

  let url: URL | null = null;
  try {
    url = new URL(input);
  } catch {
    url = null;
  }

  if (url) {
    const host = url.hostname.replace(/^(www|m|music)\./, '').toLowerCase();
    if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'youtube-nocookie.com') {
      return null;
    }
    if (host === 'youtu.be') return 'video';
    const path = url.pathname;
    if (path.startsWith('/watch')) {
      return url.searchParams.get('list') ? 'playlist' : 'video';
    }
    if (path.startsWith('/playlist')) return 'playlist';
    const first = path.split('/').filter(Boolean)[0] || '';
    if (first.startsWith('@') || first === 'channel' || first === 'c' || first === 'user') {
      return 'channel';
    }
    if (first === 'shorts' || first === 'embed' || first === 'live') return 'video';
    return null;
  }

  // Sam 11-znakowy identyfikator wideo (alfabet podobny do base64).
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return 'video';
  // Uchwyt kanału z wiodącym @ — jednoznaczny. Sama nazwa bez @ jest
  // traktowana jako zapytanie wyszukiwania, więc użytkownik wybiera kanały przez @.
  if (/^@[A-Za-z0-9_.-]+$/.test(input)) return 'channel';
  return null;
}

// Zamienia sam identyfikator wideo lub uchwyt/nazwę kanału na kanoniczny URL YouTube
// zanim trafi do yt-dlp. Pełne URL-e przechodzą bez zmian.
export function normalizeYtUrl(input: string, kind: YouTubeResolveKind): string {
  const trimmed = input.trim();
  if (kind === 'video' && /^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return `https://www.youtube.com/watch?v=${trimmed}`;
  }
  if (kind === 'channel' && !/^[a-z]+:\/\//i.test(trimmed)) {
    const handle = trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
    return `https://www.youtube.com/${handle}`;
  }
  return trimmed;
}

// Wyciąga 11-znakowy identyfikator wideo z samego id lub URL YouTube (watch,
// youtu.be, shorts, embed, live). Zwraca null dla playlist, kanałów i
// wszystkiego nierozpoznanego.
export function extractYtVideoId(rawInput: string): string | null {
  const input = rawInput.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.hostname === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0] || '';
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '').toLowerCase();
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const seg = url.pathname.split('/').filter(Boolean);
    if (seg[0] === 'shorts' || seg[0] === 'embed' || seg[0] === 'live') {
      const id = seg[1] || '';
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
  }
  return null;
}

interface BatchEntry {
  url: string;
  kind: YouTubeResolveKind;
  videoId: string | null;
}

// Dzieli wklejony tekst (nowe linie lub przecinki) na linki YouTube, odrzuca
// nierozpoznane linie i deduplikuje po identyfikatorze wideo (gdy dostępny) lub po surowym linku.
export function parseBatchInput(text: string): BatchEntry[] {
  const lines = text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: BatchEntry[] = [];
  for (const line of lines) {
    const kind = detectYtKind(line);
    if (!kind) continue;
    const videoId = extractYtVideoId(line);
    const key = videoId || line;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: line, kind, videoId });
  }
  return out;
}
