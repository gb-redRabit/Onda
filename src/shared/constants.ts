import { MIME_TYPES } from './mime';

// Listy rozszerzeń wyprowadzone z tabeli MIME, żeby nie mogły się rozjechać:
// wcześniej były osobnymi literałami, a `.alac` istniał tylko tutaj (bez MIME).
// Kolejność jest deterministyczna (kolejność kluczy `MIME_TYPES`).
function extsByMimePrefix(prefix: string): string[] {
  return Object.entries(MIME_TYPES)
    .filter(([, type]) => type.startsWith(prefix))
    .map(([ext]) => ext);
}

export const VIDEO_EXTS = extsByMimePrefix('video/');
export const AUDIO_EXTS = extsByMimePrefix('audio/');
export const IMAGE_EXTS = extsByMimePrefix('image/');

// Opcje formatu/jakości pobierania współdzielone między procesem głównym a
// rendererem. `best` dla audio oznacza "native" (bez ponownego kodowania), a
// reszta to jawne cele konwersji.
export const AUDIO_FORMATS = ['best', 'mp3', 'flac', 'ogg', 'aac', 'opus', 'm4a', 'wav'] as const;
export const VIDEO_QUALITIES = ['best', '2160p', '1440p', '1080p', '720p', '480p'] as const;
export const VIDEO_CONTAINERS = ['mp4', 'mkv', 'webm'] as const;

// Górna granica wymiarów miniatury / skalowania żądanych przez IPC lub onda://
// (wejście z renderera jest niezaufane — nigdy nie pozwól na nieograniczoną pracę sharp).
export const MAX_THUMB_SIZE = 1024;
export const MAX_RESIZE_WIDTH = 4000;
