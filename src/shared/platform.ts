// Dyspozytor międzyplatformowy — JEDYNY współdzielony moduł źródeł online.
// Specyfika platform żyje w osobnych plikach (youtube.ts / soundcloud.ts); ta
// warstwa tylko kieruje wklejony link do właściwego z nich.

import { detectYtKind, normalizeYtUrl, extractYtVideoId } from './youtube';
import { detectScKind, normalizeScUrl } from './soundcloud';

export type MediaPlatform = 'youtube' | 'soundcloud';
export type PlatformKind = 'video' | 'playlist' | 'channel';

export interface DetectedPlatform {
  platform: MediaPlatform;
  kind: PlatformKind;
}

/** Akceptuje zwykłe adresy URL dla ogólnej ścieżki ekstraktora yt-dlp. */
export function isHttpUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

// Klasyfikuje link wklejony przez użytkownika na wszystkich obsługiwanych
// platformach. Zwraca null dla wszystkiego, co jest nierozpoznawalne.
export function detectPlatform(input: string): DetectedPlatform | null {
  const yt = detectYtKind(input);
  if (yt) return { platform: 'youtube', kind: yt };
  const sc = detectScKind(input);
  if (sc) return { platform: 'soundcloud', kind: sc };
  return null;
}

// Normalizuje link dla platformy, na której go wykryto: YT rozwija same
// identyfikatory wideo i uchwyty do pełnych URL-i; permalinki SC przechodzą bez zmian.
export function normalizePlatformUrl(input: string, detected: DetectedPlatform): string {
  if (detected.platform === 'youtube') return normalizeYtUrl(input, detected.kind);
  return normalizeScUrl(input);
}

// Konwencja prefiksu zapytania: "@name" wskazuje uchwyt kanału YouTube, "$name"
// wskazuje profil SoundCloud. Oba otwierają bezpośrednio widok kanału/profilu.
export interface ChannelPrefixQuery {
  platform: MediaPlatform;
  name: string;
}

export function detectChannelPrefix(input: string): ChannelPrefixQuery | null {
  const m = input.trim().match(/^([@$])([A-Za-z0-9_.-]+)$/);
  if (!m) return null;
  return m[1] === '@'
    ? { platform: 'youtube', name: m[2] }
    : { platform: 'soundcloud', name: m[2] };
}

export interface BatchEntryPlatform {
  url: string;
  kind: PlatformKind | 'video';
  platform: MediaPlatform | 'generic';
}

// Dzieli wklejony tekst (nowe linie lub przecinki) na URL-e YT, SC i zwykłe
// HTTP(S). Kanały są pomijane (otwierają widok profilu, a nie pobieranie).
export function parseBatchInputAll(text: string): BatchEntryPlatform[] {
  const lines = text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: BatchEntryPlatform[] = [];
  for (const line of lines) {
    const detected = detectPlatform(line);
    if (detected?.kind === 'channel') continue;
    if (!detected && !isHttpUrl(line)) continue;
    let key: string;
    if (!detected) key = normalizeGenericUrl(line);
    else if (detected.platform === 'youtube') key = extractYtVideoId(line) || line.toLowerCase();
    else key = line.toLowerCase().replace(/\/+$/, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      url: line,
      kind: detected?.kind ?? 'video',
      platform: detected?.platform ?? 'generic'
    });
  }
  return out;
}

function normalizeGenericUrl(input: string): string {
  const url = new URL(input);
  url.hash = '';
  return url.href.replace(/\/$/, '');
}
