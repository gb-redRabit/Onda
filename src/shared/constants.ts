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

// Download format/quality options shared between the main process and the
// renderer. `best` for audio means "native" (no re-encode) while the rest are
// explicit conversion targets.
export const AUDIO_FORMATS = ['best', 'mp3', 'flac', 'ogg', 'aac', 'opus', 'm4a', 'wav'] as const;
export const VIDEO_QUALITIES = [
  'best',
  '2160p',
  '1440p',
  '1080p',
  '720p',
  '480p'
] as const;
export const VIDEO_CONTAINERS = ['mp4', 'mkv', 'webm'] as const;

// Upper bound for thumbnail / resize dimensions requested over IPC or onda://
// (renderer input is untrusted — never let it drive unbounded sharp work).
export const MAX_THUMB_SIZE = 1024;
export const MAX_RESIZE_WIDTH = 4000;
