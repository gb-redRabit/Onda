import { Captions, File, Film, Image, ListMusic, Music2 } from '@lucide/vue';
import type { Component } from 'vue';
import { getFileTypeInfo } from '@renderer/utils/fileTypes';

// Ikona per kategoria pliku, wspólna dla każdej powierzchni Eksploratora (siatka, tabela,
// bardzo mała lista), więc element zawsze coś renderuje — nawet zanim dotrze miniatura
// systemowa/ikona shell, albo gdy shell nie ma dla niego ikony.
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
