export const VIDEO_EXTS = [
  '.mp4',
  '.mkv',
  '.avi',
  '.webm',
  '.mov',
  '.wmv',
  '.m4v',
  '.ts',
  '.ogv',
  '.flv'
];

export const AUDIO_EXTS = [
  '.mp3',
  '.flac',
  '.wav',
  '.ogg',
  '.aac',
  '.m4a',
  '.wma',
  '.opus',
  '.aiff',
  '.alac'
];

export const IMAGE_EXTS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.svg',
  '.ico',
  '.tiff',
  '.tif'
];

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
