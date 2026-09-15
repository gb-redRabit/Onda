import { Captions, File, Film, Image, ListMusic, Music2 } from '@lucide/vue';
import type { Component } from 'vue';
import { getFileTypeInfo } from '@renderer/utils/fileTypes';

// Icon per file category, shared by every Explorer surface (grid, table,
// extra-small list) so an item always renders something — even before the OS
// thumbnail/shell icon arrives or when the shell has no icon for it.
const CATEGORY_ICONS: Record<string, Component> = {
  audio: Music2,
  video: Film,
  image: Image,
  playlist: ListMusic,
  subtitle: Captions
};

export function fileTypeIcon(extension?: string): Component {
  return CATEGORY_ICONS[getFileTypeInfo(extension || '').category] ?? File;
}
