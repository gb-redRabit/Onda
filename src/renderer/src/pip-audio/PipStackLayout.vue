<script setup lang="ts">
import PipCover from './PipCover.vue';
import {
  BTN_ACTIVE,
  BTN_EDGE,
  BTN_PLAY_EDGE,
  EDGE_PROGRESS_FILL_V,
  EDGE_PROGRESS_TRACK_V,
  VOL_LABEL
} from './pipTheme';
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

      <div v-if="has('controls')" class="flex shrink-0 flex-col items-center gap-1" @dblclick.stop>
        <button :class="BTN_PLAY_EDGE" @click.stop="send('playPause')">
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        <button :class="BTN_EDGE" @click.stop="send('prev')">&#x23EE;</button>
        <button :class="BTN_EDGE" @click.stop="send('next')">&#x23ED;</button>
        <button :class="[BTN_EDGE, shuffle ? BTN_ACTIVE : '']" @click.stop="send('shuffle')">
          &#x21C4;
        </button>
        <button
          :class="[BTN_EDGE, repeat !== 'none' ? BTN_ACTIVE : '']"
          @click.stop="send('repeat')"
        >
          &#x21BB;
        </button>
      </div>

      <div class="min-h-1 flex-1"></div>
      <div v-if="has('progress')" class="shrink-0 tabular-nums text-[9px] text-base-content/50">
        {{ fmt(currentTime) }} / {{ fmt(duration) }}
      </div>

      <div v-if="has('volume')" class="flex shrink-0 flex-col items-center gap-1" @dblclick.stop>
        <span :class="VOL_LABEL" @click.stop="send('mute')">{{ volLabel }}</span>
        <input
          type="range"
          class="my-5.5 w-14 -rotate-90"
          min="0"
          max="1"
          step="0.05"
          :value="volume"
          @input="onVolumeInput"
          @click.stop
        />
        <span class="tabular-nums text-[9px] text-base-content/50">{{ volPct }}</span>
      </div>
    </div>
  </div>
</template>
