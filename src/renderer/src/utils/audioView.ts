import { markRaw, type Component } from 'vue';
import { Circle, Puzzle, Square, Triangle } from '@lucide/vue';
import type { AudioLayoutElement } from '@renderer/types/settings';

// Pure audio-view helpers extracted from `views/AudioView.vue` (plan 2.8):
// decoration → CSS-class mapping and plugin toolbar icons.

export const DECORATION_CLASS: Record<string, Record<string, string>> = {
  visualization: {
    outline: 'ring-1 ring-inset ring-primary/40 bg-base-300/10',
    glow: 'shadow-[0_0_24px_rgba(255,255,255,0.12)] bg-base-300/10',
    glass: 'bg-base-300/20 backdrop-blur-md'
  },
  trackInfo: {
    badge: 'rounded-full px-4 py-1.5 bg-base-300/60 ring-1 ring-base-content/15',
    glass: 'rounded-field bg-base-300/30 backdrop-blur-md ring-1 ring-base-content/10',
    glow: 'drop-shadow-[0_0_8px_rgba(255,255,255,0.25)]'
  },
  progress: {
    glow: 'shadow-[0_0_14px_rgba(255,255,255,0.15)]',
    neon: 'shadow-[0_0_18px_rgba(148,163,255,0.55)]'
  },
  controls: {
    glass: 'rounded-field bg-base-300/40 backdrop-blur-md ring-1 ring-base-content/10',
    glow: 'shadow-[0_0_18px_rgba(255,255,255,0.15)]'
  }
};

// A plugin may override the user's decoration at runtime.
export function resolveElementDecoration(
  el: AudioLayoutElement,
  liveDecorations: Record<string, string | undefined>
): string | undefined {
  return liveDecorations[el.id] ?? el.decoration;
}

export function resolveDecorationClasses(
  el: AudioLayoutElement,
  liveDecorations: Record<string, string | undefined>
): string | undefined {
  const dec = resolveElementDecoration(el, liveDecorations);
  return dec && dec !== 'none' ? DECORATION_CLASS[el.id]?.[dec] : undefined;
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
