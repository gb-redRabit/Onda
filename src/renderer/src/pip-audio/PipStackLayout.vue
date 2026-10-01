<script setup lang="ts">
import PipCover from './PipCover.vue';
import PipTransport from './PipTransport.vue';
import PipVolume from './PipVolume.vue';
import { EDGE_PROGRESS_FILL_V, EDGE_PROGRESS_TRACK_V } from './pipTheme';
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
  nextTrackName,
  send,
  shuffle,
  repeat,
  fmt,
  currentTime,
  duration,
  volume,
  onVolumeInput,
  volLabel,
  volPct,
  onProgressClick
} = props.state;
</script>

<template>
  <div class="relative z-10 flex h-full w-full select-none">
    <!-- szyna postępu zawsze na krawędzi ekranu (prawa strona okna dla doku left, lewa dla right) -->
    <div
      v-if="has('progress')"
      class="group"
      :class="[EDGE_PROGRESS_TRACK_V, dock === 'left' ? 'order-2' : 'order-1']"
      @click="onProgressClick"
      @dblclick.stop
    >
      <div :class="EDGE_PROGRESS_FILL_V" :style="{ height: progressPct + '%' }"></div>
    </div>
    <div
      class="flex min-w-0 flex-1 flex-col items-center gap-1.5 py-3"
      :class="dock === 'left' ? 'order-1' : 'order-2'"
    >
      <div v-if="has('cover')" class="shrink-0">
        <PipCover
          :is-video="isVideoCover"
          :video-src="videoCoverSrc"
          :img-src="coverData"
          :playing="isPlaying"
        />
      </div>

      <div v-if="has('trackInfo')" class="max-h-[26%] px-1 text-center [writing-mode:vertical-rl]">
        <span class="truncate text-[11px] font-semibold text-base-content">{{ trackName }}</span>
      </div>
      <div
        v-if="has('nextTrack') && nextTrackName"
        class="max-h-[18%] px-1 text-center [writing-mode:vertical-rl]"
      >
        <span class="truncate text-[9px] text-base-content/40">&#x21B3; {{ nextTrackName }}</span>
      </div>

      <PipTransport
        v-if="has('controls')"
        layout="vertical"
        class="items-center"
        :send="send"
        :is-playing="isPlaying"
        :shuffle="shuffle"
        :repeat="repeat"
      />

      <div class="min-h-1 flex-1"></div>
      <div v-if="has('progress')" class="shrink-0 tabular-nums text-[9px] text-base-content/50">
        {{ fmt(currentTime) }} / {{ fmt(duration) }}
      </div>

      <PipVolume
        v-if="has('volume')"
        layout="vertical"
        slider-class="my-5.5 w-14 -rotate-90"
        :send="send"
        :volume="volume"
        :vol-label="volLabel"
        :vol-pct="volPct"
        :on-volume-input="onVolumeInput"
      />
    </div>
  </div>
</template>
