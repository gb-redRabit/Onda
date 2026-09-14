import type { AudioPipDock, AudioPipElementId } from '@shared/types/pip';

// Appearance defaults + audio-layout presets split out of `utils/constants.ts`
// (plan 2.8); re-exported from there so imports stay unchanged.

export const DEFAULT_APPEARANCE = {
  theme: 'dark' as const,
  customBase: 'dark' as const,
  glassAlpha: 100,
  fontSize: 14,
  sidebarPosition: 'left' as const,
  sidebarCollapsed: false,
  showPlaylists: true,
  showAlbums: true,
  locale: 'pl' as const,
  animations: true,
  audioPipDock: 'bottom-right' as AudioPipDock,
  audioPipAutoShow: true,
  audioPipAutoHide: true,
  audioPipCornerElements: [
    'cover',
    'trackInfo',
    'controls',
    'progress',
    'volume'
  ] as AudioPipElementId[],
  audioPipEdgeElements: [
    'cover',
    'trackInfo',
    'controls',
    'progress',
    'volume',
    'viz'
  ] as AudioPipElementId[],
  audioLayout: {
    elements: [
      {
        id: 'visualization' as const,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        opacity: 100,
        layer: 1,
        visible: true
      },
      {
        id: 'cover' as const,
        x: 27,
        y: 8,
        width: 46,
        height: 50,
        opacity: 100,
        layer: 2,
        visible: true
      },
      {
        id: 'trackInfo' as const,
        x: 18,
        y: 61,
        width: 64,
        height: 12,
        opacity: 100,
        layer: 3,
        visible: true
      },
      {
        id: 'progress' as const,
        x: 15,
        y: 75,
        width: 70,
        height: 5,
        opacity: 100,
        layer: 3,
        visible: true
      },
      {
        id: 'controls' as const,
        x: 15,
        y: 82,
        width: 70,
        height: 14,
        opacity: 100,
        layer: 5,
        visible: true
      }
    ],
    preset: 'full' as const,
    hudOpacity: 100,
    vizQuality: 'high' as const
  }
};

export const AUDIO_LAYOUT_PRESETS: Record<
  string,
  { label: string; elements: typeof DEFAULT_APPEARANCE.audioLayout.elements }
> = {
  compact: {
    label: 'Compact',
    elements: [
      {
        id: 'visualization',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        opacity: 100,
        layer: 1,
        visible: true
      },
      { id: 'cover', x: 4, y: 18, width: 24, height: 44, opacity: 100, layer: 2, visible: true },
      {
        id: 'trackInfo',
        x: 30,
        y: 26,
        width: 66,
        height: 13,
        opacity: 100,
        layer: 3,
        visible: true
      },
      { id: 'progress', x: 30, y: 44, width: 66, height: 5, opacity: 100, layer: 3, visible: true },
      { id: 'controls', x: 30, y: 54, width: 66, height: 20, opacity: 100, layer: 5, visible: true }
    ]
  },
  stacked: {
    label: 'Stacked',
    elements: [
      {
        id: 'visualization',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        opacity: 100,
        layer: 1,
        visible: true
      },
      { id: 'cover', x: 32, y: 3, width: 36, height: 40, opacity: 100, layer: 2, visible: true },
      {
        id: 'trackInfo',
        x: 22,
        y: 47,
        width: 56,
        height: 12,
        opacity: 100,
        layer: 3,
        visible: true
      },
      { id: 'progress', x: 22, y: 60, width: 56, height: 6, opacity: 100, layer: 3, visible: true },
      { id: 'controls', x: 22, y: 69, width: 56, height: 20, opacity: 100, layer: 5, visible: true }
    ]
  },
  split: {
    label: 'Split',
    elements: [
      {
        id: 'visualization',
        x: 50,
        y: 0,
        width: 50,
        height: 100,
        opacity: 100,
        layer: 1,
        visible: true
      },
      { id: 'cover', x: 4, y: 10, width: 40, height: 48, opacity: 100, layer: 2, visible: true },
      {
        id: 'trackInfo',
        x: 4,
        y: 62,
        width: 40,
        height: 10,
        opacity: 100,
        layer: 3,
        visible: true
      },
      { id: 'progress', x: 4, y: 73, width: 40, height: 5, opacity: 100, layer: 3, visible: true },
      { id: 'controls', x: 4, y: 80, width: 40, height: 16, opacity: 100, layer: 5, visible: true }
    ]
  },
  full: {
    label: 'Full',
    elements: [
      {
        id: 'visualization',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        opacity: 100,
        layer: 1,
        visible: true
      },
      { id: 'cover', x: 27, y: 8, width: 46, height: 50, opacity: 100, layer: 2, visible: true },
      {
        id: 'trackInfo',
        x: 18,
        y: 61,
        width: 64,
        height: 12,
        opacity: 100,
        layer: 3,
        visible: true
      },
      { id: 'progress', x: 15, y: 75, width: 70, height: 5, opacity: 100, layer: 3, visible: true },
      { id: 'controls', x: 15, y: 82, width: 70, height: 14, opacity: 100, layer: 5, visible: true }
    ]
  },
  immersive: {
    label: 'Immersive',
    elements: [
      {
        id: 'visualization',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        opacity: 100,
        layer: 1,
        visible: true
      },
      { id: 'cover', x: 35, y: 18, width: 30, height: 38, opacity: 95, layer: 2, visible: true },
      { id: 'trackInfo', x: 12, y: 68, width: 76, height: 9, opacity: 75, layer: 3, visible: true },
      { id: 'progress', x: 12, y: 78, width: 76, height: 4, opacity: 70, layer: 3, visible: true },
      { id: 'controls', x: 22, y: 84, width: 56, height: 13, opacity: 85, layer: 5, visible: true }
    ]
  }
};
