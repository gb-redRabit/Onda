<script setup lang="ts">
import PipCover from './PipCover.vue';
import PipTransport from './PipTransport.vue';
import PipVolume from './PipVolume.vue';
import PipEqPresets from './PipEqPresets.vue';
import { EDGE_PROGRESS_TRACK_H, EDGE_PROGRESS_FILL_H } from './pipTheme';
import type { PipState } from './pipState';

const props = defineProps<{ state: PipState }>();
const {
  dock,
  progressPct,
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
  <div class="relative z-10 flex h-full w-full select-none flex-col">
    <!-- pasek postępu zawsze na krawędzi ekranu (dół okna dla doku top, góra dla bottom) -->
    <div
      v-if="has('progress')"
      class="group"
      :class="[EDGE_PROGRESS_TRACK_H, dock === 'top' ? 'order-2' : 'order-1']"
      @click="onProgressClick"
      @dblclick.stop
    >
      <div :class="EDGE_PROGRESS_FILL_H" :style="{ width: progressPct + '%' }"></div>
    </div>
    <div
      class="flex min-h-0 flex-1 items-center gap-2 px-3"
      :class="dock === 'top' ? 'order-1' : 'order-2'"
    >
      <div v-if="has('cover')" class="flex shrink-0 items-center">
        <PipCover
          :is-video="isVideoCover"
          :video-src="videoCoverSrc"
          :img-src="coverData"
          :playing="isPlaying"
        />
      </div>

      <div
        v-if="has('trackInfo') || (has('nextTrack') && nextTrackName)"
        class="flex min-w-0 max-w-[30%] shrink-0 flex-col justify-center leading-tight"
      >
        <template v-if="has('trackInfo')">
          <span class="truncate text-[12px] font-semibold text-base-content">{{ trackName }}</span>
          <span v-if="artist" class="truncate text-[10px] text-base-content/50">{{ artist }}</span>
        </template>
        <span
          v-if="has('nextTrack') && nextTrackName"
          class="truncate text-[10px] text-base-content/60"
        >
          &#x21B3; {{ nextTrackName }}{{ nextTrackArtist ? ' — ' + nextTrackArtist : '' }}
        </span>
      </div>

      <PipTransport
        v-if="has('controls')"
        class="mx-auto"
        :send="send"
        :is-playing="isPlaying"
        :shuffle="shuffle"
        :repeat="repeat"
      />

      <div
        v-if="has('progress')"
        class="shrink-0 whitespace-nowrap tabular-nums text-[10px] text-base-content/50"
      >
        {{ fmt(currentTime) }} / {{ fmt(duration) }}
      </div>

      <PipVolume
        v-if="has('volume')"
        :send="send"
        :volume="volume"
        :vol-label="volLabel"
        :vol-pct="volPct"
        :on-volume-input="onVolumeInput"
      />

      <PipEqPresets
        v-if="has('eq')"
        class="hidden lg:flex"
        :eq-preset="eqPreset"
        :select-eq-preset="selectEqPreset"
      />
    </div>
  </div>
</template>
