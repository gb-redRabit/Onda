<script setup lang="ts">
import { inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { CLIP_TIMELINE_KEY } from '@renderer/composables/useClipTimeline';
import { TRACK_PAD_PCT } from '@renderer/utils/videoClipper';

// Os czasu: pasek miniatur/klatek, znaczniki A/B, playhead i ticki. Stan i
// handlery dostarcza widok przez `provide(CLIP_TIMELINE_KEY, ...)`.
const { t } = useI18n();
const context = inject(CLIP_TIMELINE_KEY);
if (!context) throw new Error('ClipTimeline requires a provided timeline context');

const {
  duration,
  timelineZoom,
  timelineScrollEl,
  timelineEl,
  onTimelineScroll,
  onTimelineWheel,
  onTimelinePointerDown,
  beginMarkerDrag,
  trackPct,
  startPct,
  endPct,
  currentPct,
  timelineTicks,
  frameStrip,
  frameStripActive,
  frameStripCovers,
  frameStripLoading,
  thumbnails,
  thumbsLoading,
  thumbsRefreshing,
  thumbsError
} = context;

// W szablonie ustawiają je `ref="..."` (te same refy, które przekazał widok).
void timelineEl;
void timelineScrollEl;
</script>

<template>
  <div
    ref="timelineScrollEl"
    data-testid="clip-timeline-scroll"
    class="mt-2 overflow-x-auto"
    @scroll.passive="onTimelineScroll"
    @wheel="onTimelineWheel"
  >
    <div
      ref="timelineEl"
      data-testid="clip-timeline"
      :data-duration="duration"
      :style="{ width: `${timelineZoom * 100}%` }"
      class="relative h-28 touch-none select-none rounded-field border border-hairline bg-base-200/60"
      @pointerdown="onTimelinePointerDown"
    >
      <div
        class="pointer-events-none absolute top-2 h-14 overflow-hidden rounded border border-hairline/50 bg-base-300/50"
        :style="{ left: `${TRACK_PAD_PCT}%`, right: `${TRACK_PAD_PCT}%` }"
      >
        <div
          v-if="frameStripActive && frameStripCovers && frameStrip"
          class="relative h-full w-full"
        >
          <div
            v-for="(frame, index) in frameStrip.frames"
            :key="index"
            data-testid="clip-frame"
            class="absolute inset-y-0 overflow-hidden border-r border-scrim/25"
            :style="{
              left: `${((frameStrip.startSec + index * frameStrip.stepSec) / duration) * 100}%`,
              width: `${(frameStrip.stepSec / duration) * 100}%`
            }"
          >
            <img :src="frame" alt="" draggable="false" class="h-full w-full object-cover" />
          </div>
        </div>
        <div v-else-if="thumbsLoading" class="h-full w-full animate-pulse bg-base-content/10" />
        <div v-else-if="thumbnails.length" class="flex h-full w-full">
          <img
            v-for="(thumb, index) in thumbnails"
            :key="index"
            :src="thumb"
            alt=""
            draggable="false"
            class="h-full min-w-0 flex-1 object-cover opacity-80"
          />
        </div>
        <div
          v-else
          class="flex h-full items-center justify-center px-2 text-center text-3xs text-base-content/45"
          :title="thumbsError"
        >
          {{ t('tools.clipThumbnailsUnavailable') }}
        </div>
        <div
          v-if="(thumbsRefreshing || frameStripLoading) && thumbnails.length"
          class="pointer-events-none absolute inset-0 animate-pulse bg-base-100/20"
        />
      </div>
      <div
        class="absolute top-[76%] h-2 -translate-y-1/2 overflow-hidden rounded-full bg-base-300"
        :style="{ left: `${TRACK_PAD_PCT}%`, right: `${TRACK_PAD_PCT}%` }"
      >
        <div
          class="h-full bg-primary/35"
          :style="{
            marginLeft: `${startPct}%`,
            width: `${Math.max(0, endPct - startPct)}%`
          }"
        />
        <div class="absolute inset-y-0 left-0 bg-primary/60" :style="{ width: `${currentPct}%` }" />
      </div>

      <div
        v-for="tick in timelineTicks"
        :key="`${tick.kind}-${tick.left}`"
        data-testid="clip-tick"
        :data-tick-kind="tick.kind"
        class="pointer-events-none absolute w-px"
        :class="
          tick.kind === 'major'
            ? 'inset-y-0 bg-base-content/15'
            : tick.kind === 'minor'
              ? 'bottom-4 h-4 bg-base-content/10'
              : 'bottom-4 h-2 bg-base-content/10'
        "
        :style="{ left: `${trackPct(tick.left)}%` }"
      >
        <span
          v-if="tick.label"
          class="absolute bottom-1 left-1 whitespace-nowrap font-mono text-4xs text-base-content/45"
        >
          {{ tick.label }}
        </span>
      </div>

      <div
        class="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-error"
        :style="{ left: `${trackPct(currentPct)}%` }"
      >
        <span
          class="absolute -top-0.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-error shadow"
        />
      </div>

      <button
        type="button"
        data-testid="clip-marker-start"
        class="absolute inset-y-0 z-20 w-4 -translate-x-1/2 cursor-ew-resize touch-none"
        :style="{ left: `${trackPct(startPct)}%` }"
        :aria-label="t('tools.clipSetStart')"
        @pointerdown.stop.prevent="beginMarkerDrag('start', $event)"
      >
        <span class="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-primary" />
        <span
          class="absolute left-1/2 top-1 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border-2 border-base-100 bg-primary text-4xs font-bold text-primary-content shadow"
        >
          A
        </span>
      </button>

      <button
        type="button"
        data-testid="clip-marker-end"
        class="absolute inset-y-0 z-20 w-4 -translate-x-1/2 cursor-ew-resize touch-none"
        :style="{ left: `${trackPct(endPct)}%` }"
        :aria-label="t('tools.clipSetEnd')"
        @pointerdown.stop.prevent="beginMarkerDrag('end', $event)"
      >
        <span class="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-primary" />
        <span
          class="absolute left-1/2 top-1 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border-2 border-base-100 bg-primary text-4xs font-bold text-primary-content shadow"
        >
          B
        </span>
      </button>
    </div>
  </div>
</template>
