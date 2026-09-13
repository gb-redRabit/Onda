import { Film, Image, ImagePlus, Scissors } from '@lucide/vue';

// Static download-config-dialog metadata extracted from
// `components/online/DownloadConfigDialog.vue` (plan 2.8).

export const DOWNLOAD_COVER_TYPES = [
  { id: 'thumbnail', icon: Image, key: 'youtube.coverThumbnail' },
  { id: 'custom', icon: ImagePlus, key: 'youtube.coverCustom' },
  { id: 'frame', icon: Film, key: 'youtube.coverFrame' },
  { id: 'clip', icon: Scissors, key: 'youtube.coverClip' }
] as const;

export const AUDIO_QUALITIES = ['best', 'high', 'medium', 'low'] as const;
