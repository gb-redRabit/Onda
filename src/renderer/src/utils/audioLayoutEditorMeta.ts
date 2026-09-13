import {
  AlignVerticalSpaceAround,
  Columns2,
  Disc3,
  LayoutPanelLeft,
  ListMusic,
  Maximize,
  Music2,
  Orbit,
  Play,
  SlidersHorizontal
} from '@lucide/vue';
import type { AudioLayoutElementId, AudioLayoutPreset } from '@renderer/types/settings';

// Static audio-layout-editor metadata extracted from
// `components/audio/AudioLayoutEditor.vue` (plan 2.8).

export type RightTab = 'elements' | 'variant' | 'layout';

export const PRESET_ICONS: Record<AudioLayoutPreset, typeof LayoutPanelLeft> = {
  compact: LayoutPanelLeft,
  stacked: AlignVerticalSpaceAround,
  split: Columns2,
  full: Maximize,
  immersive: Orbit
};

export const PRESET_KEYS: AudioLayoutPreset[] = [
  'compact',
  'stacked',
  'split',
  'full',
  'immersive'
];

export const ELEMENT_META: Record<
  AudioLayoutElementId,
  { icon: typeof Music2; labelKey: string; defaultLayer: number }
> = {
  visualization: { icon: Music2, labelKey: 'audioView.elementVisualization', defaultLayer: 1 },
  cover: { icon: Disc3, labelKey: 'audioView.elementCover', defaultLayer: 2 },
  trackInfo: { icon: ListMusic, labelKey: 'audioView.elementTrackInfo', defaultLayer: 3 },
  progress: { icon: Play, labelKey: 'audioView.elementProgress', defaultLayer: 3 },
  controls: { icon: SlidersHorizontal, labelKey: 'audioView.elementControls', defaultLayer: 5 }
};

// ─── Warianty (presety per typ) ───
export const VARIANT_KEYS: Record<AudioLayoutElementId, { value: string; key: string }[]> = {
  visualization: [{ value: 'default', key: 'variant_visualization_default' }],
  cover: [
    { value: 'default', key: 'variant_cover_default' },
    { value: 'rounded', key: 'variant_cover_rounded' },
    { value: 'ring', key: 'variant_cover_ring' },
    { value: 'glass', key: 'variant_cover_glass' }
  ],
  trackInfo: [
    { value: 'classic', key: 'variant_trackInfo_classic' },
    { value: 'minimal', key: 'variant_trackInfo_minimal' },
    { value: 'large', key: 'variant_trackInfo_large' }
  ],
  progress: [
    { value: 'classic', key: 'variant_progress_classic' },
    { value: 'thin', key: 'variant_progress_thin' },
    { value: 'neon', key: 'variant_progress_neon' }
  ],
  controls: [
    { value: 'standard', key: 'variant_controls_standard' },
    { value: 'compact', key: 'variant_controls_compact' }
  ]
};

export const VARIANT_DEFAULT: Record<AudioLayoutElementId, string> = {
  visualization: 'default',
  cover: 'default',
  trackInfo: 'classic',
  progress: 'classic',
  controls: 'standard'
};

export const SUBTAB_KEYS: Record<RightTab, string> = {
  elements: 'tabElements',
  variant: 'tabVariant',
  layout: 'tabLayout'
};

export const TABS: RightTab[] = ['elements', 'variant', 'layout'];
