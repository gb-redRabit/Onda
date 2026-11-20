<script setup lang="ts">
import { inject } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Clock,
  LocateFixed,
  Magnet,
  Maximize2,
  Pause,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Scan
} from '@lucide/vue';
import { MAX_ZOOM, MIN_ZOOM } from '@renderer/utils/videoClipper';
import { CLIP_TRANSPORT_KEY } from './clip-transport-context';

// Pasek narzędzi odtwarzania i zaznaczenia. Stan dostarcza widok; komponent
// tylko renderuje i woła handlery (nie zapisuje do refów).
const { t } = useI18n();
const context = inject(CLIP_TRANSPORT_KEY);
if (!context) throw new Error('ClipTransport requires a provided transport context');

const {
  busy,
  duration,
  isPlaying,
  startSec,
  endSec,
  addClip,
  toggleSnap,
  toggleFollow,
  togglePlay,
  seekBy,
  seekByFrames,
  snapEnabled,
  loopRange,
  toggleLoop,
  setStart,
  setEnd,
  previewing,
  previewClip,
  clipDuration,
  followPlayhead,
  fitAll,
  fitSelection,
  fitSecond,
  timelineZoom,
  zoomBy,
  zoomLabel,
  fpsLabel,
  formatTimecode,
  resetRange
} = context;
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <button
      type="button"
      data-testid="clip-play"
      class="fx-noise flex h-8 w-8 items-center justify-center rounded-field border border-hairline transition-colors hover:bg-base-content/10 disabled:opacity-40"
      :disabled="busy"
      :aria-label="isPlaying ? t('tools.clipPause') : t('tools.clipPlay')"
      @click="togglePlay"
    >
      <Pause v-if="isPlaying" :size="14" />
      <Play v-else :size="14" />
    </button>
    <button
      type="button"
      class="fx-noise rounded-field border border-hairline px-2.5 py-1.5 text-xs transition-colors hover:bg-base-content/10"
      :disabled="busy"
      @click="seekBy(-1)"
    >
      −1 s
    </button>
    <button
      type="button"
      class="fx-noise rounded-field border border-hairline px-2.5 py-1.5 text-xs transition-colors hover:bg-base-content/10"
      :disabled="busy"
      @click="seekBy(1)"
    >
      +1 s
    </button>
    <button
      type="button"
      data-testid="clip-prev-frame"
      class="fx-noise rounded-field border border-hairline px-2 py-1.5 text-xs transition-colors hover:bg-base-content/10"
      :disabled="busy"
      :title="t('tools.clipPrevFrame')"
      :aria-label="t('tools.clipPrevFrame')"
      @click="seekByFrames(-1)"
    >
      −1 f
    </button>
    <button
      type="button"
      data-testid="clip-next-frame"
      class="fx-noise rounded-field border border-hairline px-2 py-1.5 text-xs transition-colors hover:bg-base-content/10"
      :disabled="busy"
      :title="t('tools.clipNextFrame')"
      :aria-label="t('tools.clipNextFrame')"
      @click="seekByFrames(1)"
    >
      +1 f
    </button>
    <span class="mx-1 h-5 w-px bg-base-300" />
    <button
      type="button"
      data-testid="clip-snap"
      class="fx-noise rounded-field border p-1.5 transition-colors"
      :class="
        snapEnabled
          ? 'border-primary/50 bg-primary/10 text-primary-text'
          : 'border-hairline text-base-content/50 hover:bg-base-content/10'
      "
      :aria-pressed="snapEnabled"
      :title="t('tools.clipSnap')"
      :aria-label="t('tools.clipSnap')"
      @click="toggleSnap"
    >
      <Magnet :size="13" />
    </button>
    <button
      type="button"
      data-testid="clip-loop"
      class="fx-noise rounded-field border p-1.5 transition-colors"
      :class="
        loopRange
          ? 'border-primary/50 bg-primary/10 text-primary-text'
          : 'border-hairline text-base-content/50 hover:bg-base-content/10'
      "
      :aria-pressed="loopRange"
      :title="t('tools.clipLoop')"
      :aria-label="t('tools.clipLoop')"
      @click="toggleLoop"
    >
      <Repeat :size="13" />
    </button>
    <span class="mx-1 h-5 w-px bg-base-300" />
    <button
      type="button"
      data-testid="clip-set-start"
      class="fx-noise rounded-field border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary-text transition-colors hover:bg-primary/15"
      :disabled="busy || duration <= 0"
      @click="setStart"
    >
      {{ t('tools.clipSetStart') }}
    </button>
    <button
      type="button"
      data-testid="clip-set-end"
      class="fx-noise rounded-field border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary-text transition-colors hover:bg-primary/15"
      :disabled="busy || duration <= 0"
      @click="setEnd"
    >
      {{ t('tools.clipSetEnd') }}
    </button>
    <button
      type="button"
      data-testid="clip-preview"
      class="fx-noise rounded-field border border-hairline px-2.5 py-1.5 text-xs transition-colors hover:bg-base-content/10 disabled:opacity-40"
      :disabled="busy || duration <= 0"
      @click="previewClip"
    >
      {{ previewing ? t('tools.clipStopPreview') : t('tools.clipPreview') }}
    </button>
    <button
      type="button"
      data-testid="clip-add"
      class="fx-noise flex items-center gap-1 rounded-field border border-hairline px-2.5 py-1.5 text-xs transition-colors hover:bg-base-content/10 disabled:opacity-40"
      :disabled="busy || clipDuration < 0.05"
      @click="addClip"
    >
      <Plus :size="12" />
      {{ t('tools.clipAddToList') }}
    </button>
    <div class="ml-auto flex items-center gap-1">
      <span class="mr-1 font-mono text-3xs text-base-content/40">
        {{ t('tools.clipFps', { fps: fpsLabel }) }}
      </span>
      <button
        type="button"
        data-testid="clip-follow"
        class="fx-noise rounded-field border p-1.5 transition-colors"
        :class="
          followPlayhead
            ? 'border-primary/50 bg-primary/10 text-primary-text'
            : 'border-hairline text-base-content/50 hover:bg-base-content/10'
        "
        :aria-pressed="followPlayhead"
        :title="t('tools.clipFollow')"
        :aria-label="t('tools.clipFollow')"
        @click="toggleFollow"
      >
        <LocateFixed :size="13" />
      </button>
      <button
        type="button"
        data-testid="clip-fit"
        class="fx-noise rounded-field border border-hairline p-1.5 text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content"
        :disabled="busy || duration <= 0"
        :title="t('tools.clipFit')"
        :aria-label="t('tools.clipFit')"
        @click="fitAll"
      >
        <Maximize2 :size="13" />
      </button>
      <button
        type="button"
        data-testid="clip-fit-selection"
        class="fx-noise rounded-field border border-hairline p-1.5 text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content disabled:opacity-40"
        :disabled="busy || clipDuration <= 0"
        :title="t('tools.clipFitSelection')"
        :aria-label="t('tools.clipFitSelection')"
        @click="fitSelection"
      >
        <Scan :size="13" />
      </button>
      <button
        type="button"
        data-testid="clip-fit-second"
        class="fx-noise flex items-center gap-1 rounded-field border border-hairline px-2 py-1.5 text-2xs text-base-content/60 transition-colors hover:bg-base-content/10 hover:text-base-content disabled:opacity-40"
        :disabled="busy || duration <= 0"
        :title="t('tools.clipFitSecond')"
        :aria-label="t('tools.clipFitSecond')"
        @click="fitSecond"
      >
        <Clock :size="12" />
        {{ t('tools.clipFitSecondShort') }}
      </button>
      <span class="mx-1 h-5 w-px bg-base-300" />
      <button
        type="button"
        data-testid="clip-zoom-out"
        class="fx-noise rounded-field border border-hairline px-2 py-1 text-xs text-base-content/60 transition-colors hover:bg-base-content/10 disabled:opacity-40"
        :disabled="busy || timelineZoom <= MIN_ZOOM"
        :aria-label="t('tools.clipZoomOut')"
        @click="zoomBy(-1)"
      >
        −
      </button>
      <span data-testid="clip-zoom-label" class="w-12 text-center text-3xs text-base-content/50">
        {{ zoomLabel }}×
      </span>
      <button
        type="button"
        data-testid="clip-zoom-in"
        class="fx-noise rounded-field border border-hairline px-2 py-1 text-xs text-base-content/60 transition-colors hover:bg-base-content/10 disabled:opacity-40"
        :disabled="busy || timelineZoom >= MAX_ZOOM"
        :aria-label="t('tools.clipZoomIn')"
        @click="zoomBy(1)"
      >
        +
      </button>
      <button
        type="button"
        class="fx-noise rounded-field border border-hairline p-1.5 text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content disabled:opacity-40"
        :disabled="busy || duration <= 0"
        :title="t('tools.clipReset')"
        :aria-label="t('tools.clipReset')"
        @click="resetRange"
      >
        <RotateCcw :size="13" />
      </button>
    </div>
  </div>

  <div class="mt-3 flex items-center justify-between gap-2 text-2xs text-base-content/55">
    <span data-testid="clip-start-label" class="font-mono">{{ formatTimecode(startSec) }}</span>
    <span class="rounded-full bg-base-300/70 px-2 py-0.5 font-medium">
      {{ t('tools.clipLength', { duration: formatTimecode(clipDuration) }) }}
    </span>
    <span data-testid="clip-end-label" class="font-mono">{{ formatTimecode(endSec) }}</span>
  </div>
</template>
