<script setup lang="ts">
import PipCover from './PipCover.vue';
import { BTN, BTN_PLAY, BTN_ACTIVE, VOL_LABEL, EQ_BTN, EQ_BTN_ON } from './pipTheme';
import { EQ_PRESETS } from './usePipAudioState';
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
      <div v-if="has('controls')" class="flex items-center gap-0.5" @dblclick.stop>
        <button :class="[BTN, shuffle ? BTN_ACTIVE : '']" @click.stop="send('shuffle')">
          &#x21C4;
        </button>
        <button :class="BTN" @click.stop="send('prev')">&#x23EE;</button>
        <button :class="BTN_PLAY" @click.stop="send('playPause')">
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        <button :class="BTN" @click.stop="send('next')">&#x23ED;</button>
        <button :class="[BTN, repeat !== 'none' ? BTN_ACTIVE : '']" @click.stop="send('repeat')">
          &#x21BB;<span v-if="repeat === 'one'" class="-ml-px text-[8px]">1</span>
        </button>
      </div>
    </div>

    <div
      v-if="has('volume') || has('eq')"
      class="flex shrink-0 flex-col items-end justify-center gap-1"
      @dblclick.stop
    >
      <div v-if="has('volume')" class="flex items-center gap-1">
        <span :class="VOL_LABEL" @click.stop="send('mute')">{{ volLabel }}</span>
        <input
          type="range"
          class="w-14"
          min="0"
          max="1"
          step="0.05"
          :value="volume"
          @input="onVolumeInput"
          @click.stop
        />
        <span class="min-w-5 text-right tabular-nums text-[9px] text-base-content/50">{{
          volPct
        }}</span>
      </div>
      <div v-if="has('eq')" class="flex items-center gap-0.5">
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
