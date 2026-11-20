import type { InjectionKey, Ref } from 'vue';
import type { ClipTimelineApi } from '@renderer/composables/useClipTimeline';

/**
 * Stan sterowania odtwarzaniem/narzędziami Video Clippera. Widok tworzy go z
 * własnych refów i API osi czasu, a `ClipTransport` tylko go renderuje — dzięki
 * temu toolbar nie powiela logiki ani nie zapisuje bezpośrednio do refów.
 */
export interface ClipTransportContext {
  busy: Ref<boolean>;
  duration: Ref<number>;
  isPlaying: Ref<boolean>;
  startSec: Ref<number>;
  endSec: Ref<number>;
  addClip: () => void;
  toggleSnap: () => void;
  toggleFollow: () => void;
  togglePlay: ClipTimelineApi['togglePlay'];
  seekBy: ClipTimelineApi['seekBy'];
  seekByFrames: ClipTimelineApi['seekByFrames'];
  snapEnabled: ClipTimelineApi['snapEnabled'];
  loopRange: ClipTimelineApi['loopRange'];
  toggleLoop: ClipTimelineApi['toggleLoop'];
  setStart: ClipTimelineApi['setStart'];
  setEnd: ClipTimelineApi['setEnd'];
  previewing: ClipTimelineApi['previewing'];
  previewClip: ClipTimelineApi['previewClip'];
  clipDuration: ClipTimelineApi['clipDuration'];
  followPlayhead: ClipTimelineApi['followPlayhead'];
  fitAll: ClipTimelineApi['fitAll'];
  fitSelection: ClipTimelineApi['fitSelection'];
  fitSecond: ClipTimelineApi['fitSecond'];
  timelineZoom: ClipTimelineApi['timelineZoom'];
  zoomBy: ClipTimelineApi['zoomBy'];
  zoomLabel: ClipTimelineApi['zoomLabel'];
  fpsLabel: ClipTimelineApi['fpsLabel'];
  formatTimecode: ClipTimelineApi['formatTimecode'];
  resetRange: ClipTimelineApi['resetRange'];
}

export const CLIP_TRANSPORT_KEY: InjectionKey<ClipTransportContext> = Symbol('clipTransport');
