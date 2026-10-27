import { logger } from '../../shared/logger';
import type { DiscordCoverQuery } from '../../shared/types/discord';

// Discord pobiera obraz okładki z zewnątrz (przez własny proxy), więc adres
// `http://127.0.0.1/...` nie zadziała — serwer mediów nie jest widoczny z internetu.
// Dla plików lokalnych szukamy publicznej okładki w katalogu iTunes i wysyłamy jej URL.

const ITUNES_URL = 'https://itunes.apple.com/search';
const LOOKUP_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

interface CacheEntry {
  url: string | null;
  at: number;
}

interface ITunesResult {
  trackName?: unknown;
  artistName?: unknown;
  artworkUrl100?: unknown;
}

const cache = new Map<string, CacheEntry>();

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : undefined;
}

/** Waliduje ładunek z renderera; brak wykonawcy lub tytułu = brak zapytania. */
export function normalizeCoverQuery(input: unknown): DiscordCoverQuery | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const title = cleanText(raw.title, 200);
  const artist = cleanText(raw.artist, 200);
  const album = cleanText(raw.album, 200);
  if (!title || !artist) return null;
  const query: DiscordCoverQuery = { title, artist };
  if (album) query.album = album;
  return query;
}

/**
 * Podnosi miniaturę iTunes (`100x100bb`) do 600 px i przepuszcza wyłącznie adresy
 * z domeny Apple — renderer nie może wskazać dowolnego hosta jako okładki.
 */
export function upgradeArtworkUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'mzstatic.com' && !host.endsWith('.mzstatic.com')) return null;
  url.pathname = url.pathname.replace(/\/\d+x\d+bb\.(jpe?g|png|webp)$/i, '/600x600bb.$1');
  return url.toString();
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Wybiera najlepszy wynik wyszukiwania. Wymagamy podobieństwa tytułu, żeby nie
 * pokazać okładki innego utworu tylko dlatego, że wykonawca się zgadza.
 */
export function pickCoverUrl(results: unknown, query: DiscordCoverQuery): string | null {
  if (!Array.isArray(results)) return null;
  const wantTitle = normalizeText(query.title);
  const wantArtist = query.artist ? normalizeText(query.artist) : '';
  let best: { score: number; url: string } | null = null;

  for (const item of results) {
    if (!item || typeof item !== 'object') continue;
    const result = item as ITunesResult;
    const url = upgradeArtworkUrl(result.artworkUrl100);
    if (!url) continue;
    const track = normalizeText(String(result.trackName ?? ''));
    const artist = normalizeText(String(result.artistName ?? ''));

    let titleScore = 0;
    if (track && wantTitle) {
      if (track === wantTitle) titleScore = 4;
      else if (track.includes(wantTitle) || wantTitle.includes(track)) titleScore = 2;
    }
    if (!titleScore) continue;

    let score = titleScore;
    if (wantArtist && artist) {
      if (artist === wantArtist) score += 3;
      else if (artist.includes(wantArtist) || wantArtist.includes(artist)) score += 1;
    }
    if (!best || score > best.score) best = { score, url };
  }

  return best?.url ?? null;
}

function remember(key: string, url: string | null): void {
  cache.set(key, { url, at: Date.now() });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Zwraca publiczny URL okładki albo `null`. Wyniki (także puste) są cache'owane. */
export async function resolveCoverUrl(query: DiscordCoverQuery): Promise<string | null> {
  const key = [query.artist ?? '', query.album ?? '', query.title].join('|').toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.url;

  const term = [query.artist, query.title].filter(Boolean).join(' ');
  const url = `${ITUNES_URL}?term=${encodeURIComponent(term)}&entity=song&limit=5&media=music`;

  let resolved: string | null = null;
  let completed = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (response.ok) {
      const data = (await response.json()) as { results?: unknown };
      resolved = pickCoverUrl(data.results, query);
      completed = true;
    }
  } catch (error) {
    logger.info('discord', `cover lookup failed: ${errorMessage(error)}`);
  } finally {
    clearTimeout(timer);
  }

  // Błędu sieci nie cache'ujemy — inaczej chwilowa awaria ukrywałaby okładki
  // przez cały TTL. Brak dopasowania (udana odpowiedź) jest cache'owany.
  if (completed) remember(key, resolved);
  return resolved;
}
