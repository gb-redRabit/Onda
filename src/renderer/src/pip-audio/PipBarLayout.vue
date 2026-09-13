<script setup lang="ts">
import PipCover from './PipCover.vue';
import {
  BTN_ACTIVE,
  BTN_EDGE,
  BTN_PLAY_EDGE,
  EDGE_PROGRESS_TRACK_H,
  EDGE_PROGRESS_FILL_H,
  VOL_LABEL,
  EQ_BTN,
  EQ_BTN_ON
} from './pipTheme';
import { EQ_PRESETS } from './usePipAudioState';
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
          class="truncate text-[10px] text-base-content/40"
        >
          &#x21B3; {{ nextTrackName }}{{ nextTrackArtist ? ' — ' + nextTrackArtist : '' }}
        </span>
      </div>

      <div v-if="has('controls')" class="mx-auto flex shrink-0 items-center gap-1" @dblclick.stop>
        <button :class="[BTN_EDGE, shuffle ? BTN_ACTIVE : '']" @click.stop="send('shuffle')">
          &#x21C4;
        </button>
        <button :class="BTN_EDGE" @click.stop="send('prev')">&#x23EE;</button>
        <button :class="BTN_PLAY_EDGE" @click.stop="send('playPause')">
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        <button :class="BTN_EDGE" @click.stop="send('next')">&#x23ED;</button>
        <button
          :class="[BTN_EDGE, repeat !== 'none' ? BTN_ACTIVE : '']"
          @click.stop="send('repeat')"
        >
          &#x21BB;
        </button>
      </div>

      <div
        v-if="has('progress')"
        class="shrink-0 whitespace-nowrap tabular-nums text-[10px] text-base-content/50"
      >
        {{ fmt(currentTime) }} / {{ fmt(duration) }}
      </div>

      <div v-if="has('volume')" class="flex shrink-0 items-center gap-1" @dblclick.stop>
        <span :class="VOL_LABEL" @click.stop="send('mute')">{{ volLabel }}</span>
        <input
          type="range"
          class="w-16"
          min="0"
          max="1"
          step="0.05"
          :value="volume"
          @input="onVolumeInput"
          @click.stop
        />
      </div>

      <div v-if="has('eq')" class="hidden shrink-0 items-center gap-0.5 lg:flex" @dblclick.stop>
        <button
          v-for="p in EQ_PRESETS.slice(0, 4)"
          :key="p.id"
          :class="[EQ_BTN, eqPreset === p.id ? EQ_BTN_ON : '']"
          @click.stop="selectEqPreset(p.id)"
        >
          {{ p.label }}
        </button>
      </div>
    </div>
  </div>
</template>
