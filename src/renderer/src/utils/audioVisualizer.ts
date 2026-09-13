import type { VisualizationMode } from '@renderer/types/settings';

// Static audio-visualizer data extracted from
// `components/audio/AudioVisualizer.vue` (plan 2.8).

export const VIZ_CYCLES: VisualizationMode[] = [
  'bars',
  'spectrum',
  'wave',
  'radial',
  'rings',
  'circle',
  'particles',
  'none'
];

export const QUALITY_PRESETS = {
  low: { dprCap: 1, barCount: 32, radialCount: 64, circleCount: 90, particleCount: 30 },
  medium: { dprCap: 1.5, barCount: 48, radialCount: 96, circleCount: 135, particleCount: 55 },
  high: { dprCap: 2, barCount: 64, radialCount: 128, circleCount: 180, particleCount: 80 }
} as const;

export type VizQuality = keyof typeof QUALITY_PRESETS;

export function qualityPreset(q: string | undefined): (typeof QUALITY_PRESETS)[VizQuality] {
  return QUALITY_PRESETS[(q as VizQuality) ?? 'high'] ?? QUALITY_PRESETS.high;
}

export type VizMode = VisualizationMode;

export function nextVizMode(current: string | undefined): VizMode {
  const idx = VIZ_CYCLES.indexOf(current as VizMode);
  return VIZ_CYCLES[(idx + 1) % VIZ_CYCLES.length];
}
