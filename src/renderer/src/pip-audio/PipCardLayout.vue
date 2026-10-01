<script setup lang="ts">
import PipCover from './PipCover.vue';
import PipTransport from './PipTransport.vue';
import PipVolume from './PipVolume.vue';
import PipEqPresets from './PipEqPresets.vue';
import { BTN, BTN_PLAY } from './pipTheme';
import type { PipState } from './pipState';

const props = defineProps<{ state: PipState }>();
const {
  isVideoCover,
  videoCoverSrc,
  coverData,
  isPlaying,
  has,
  trackName,
  artist,
  nextTrackName,
  nextTrackArtist,
  fmt,
  currentTime,
  duration,
  progressPct,
  onProgressClick,
  send,
  shuffle,
  repeat,
  volume,
  onVolumeInput,
  volLabel,
  volPct,
  eqPreset,
  selectEqPreset
} = props.state;
</script>

<template>
  <div class="relative z-10 flex h-full w-full select-none items-stretch gap-2 px-2.5 py-1.5">
    <div v-if="has('cover')" class="flex shrink-0 items-center">
      <PipCover
        :is-video="isVideoCover"
        :video-src="videoCoverSrc"
        :img-src="coverData"
        :playing="isPlaying"
        size="sm"
      />
    </div>

    <div class="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
      <template v-if="has('trackInfo')">
        <div class="truncate text-xs font-semibold leading-tight text-base-content">
          {{ trackName }}
        </div>
        <div v-if="artist" class="truncate text-[10px] leading-tight text-base-content/50">
          {{ artist }}
        </div>
        <div
          v-if="has('nextTrack') && nextTrackName"
          class="truncate text-[10px] leading-tight text-base-content/40"
        >
          &#x21B3; {{ nextTrackName }}{{ nextTrackArtist ? ' — ' + nextTrackArtist : '' }}
        </div>
      </template>
      <div v-if="has('progress')" class="flex items-center gap-1.5">
        <span class="whitespace-nowrap tabular-nums text-[9px] text-base-content/50">{{
          fmt(currentTime)
        }}</span>
        <div
          data-testid="pip-progress"
          class="h-1 flex-1 cursor-pointer rounded bg-base-content/10"
          @click="onProgressClick"
          @dblclick.stop
        >
          <div
            class="h-full rounded bg-primary transition-[width]"
            :style="{ width: progressPct + '%' }"
          ></div>
        </div>
        <span class="whitespace-nowrap tabular-nums text-[9px] text-base-content/50">{{
          fmt(duration)
        }}</span>
      </div>
      <PipTransport
        v-if="has('controls')"
        :send="send"
        :is-playing="isPlaying"
        :shuffle="shuffle"
        :repeat="repeat"
        :btn-class="BTN"
        :play-btn-class="BTN_PLAY"
      />
    </div>

    <div
      v-if="has('volume') || has('eq')"
      class="flex shrink-0 flex-col items-end justify-center gap-1"
      @dblclick.stop
    >
      <PipVolume
        v-if="has('volume')"
        :send="send"
        :volume="volume"
        :vol-label="volLabel"
        :vol-pct="volPct"
        :on-volume-input="onVolumeInput"
        slider-class="w-14"
      />
      <PipEqPresets v-if="has('eq')" :eq-preset="eqPreset" :select-eq-preset="selectEqPreset" />
    </div>
  </div>
</template>
