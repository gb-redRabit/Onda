import { markRaw, type Component } from 'vue';
import { Circle, Puzzle, Square, Triangle } from '@lucide/vue';
import type { AudioLayoutElement } from '@renderer/types/settings';

// Czyste helpery widoku audio wydzielone z `views/AudioView.vue` (plan 2.8):
// rozwiązywanie dekoracji elementu i ikony paska narzędzi wtyczek. Dekoracje pochodzą z
// wtyczek (`element.decoration`); host renderuje tylko warianty zarejestrowane
// w `PLUGIN_HOST_VARIANTS` (ścieżki clip cover żyją w `AudioCover.vue`).

// Wtyczka może nadpisać dekorację użytkownika w czasie działania.
export function resolveElementDecoration(
  el: AudioLayoutElement,
  liveDecorations: Record<string, string | undefined>
): string | undefined {
  return liveDecorations[el.id] ?? el.decoration;
}

const PLUGIN_TOOLBAR_ICONS: Record<string, Component> = {
  Triangle: markRaw(Triangle),
  Puzzle: markRaw(Puzzle),
  Circle: markRaw(Circle),
  Square: markRaw(Square)
};

export function pluginIcon(name?: string): Component {
  return (name && PLUGIN_TOOLBAR_ICONS[name]) || Puzzle;
}
