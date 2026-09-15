import { markRaw, type Component } from 'vue';
import { Circle, Puzzle, Square, Triangle } from '@lucide/vue';
import type { AudioLayoutElement } from '@renderer/types/settings';

// Pure audio-view helpers extracted from `views/AudioView.vue` (plan 2.8):
// element decoration resolution and plugin toolbar icons. Decorations come from
// plugins (`element.decoration`); the host only renders the variants registered
// in `PLUGIN_HOST_VARIANTS` (cover clip paths live in `AudioCover.vue`).

// A plugin may override the user's decoration at runtime.
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
