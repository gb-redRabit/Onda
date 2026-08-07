<script setup lang="ts">
import { usePipVisualizer } from './usePipVisualizer';
import { usePipAudioState } from './usePipAudioState';
import PipModeMax from './PipModeMax.vue';
import PipModeWide from './PipModeWide.vue';

const handlers = { updateAccent: () => {} };
const state = usePipAudioState(handlers);
const viz = usePipVisualizer(state.vizData);
handlers.updateAccent = viz.updateAccent;

const {
  trackName,
  artist,
  coverData,
  isPlaying,
  currentTime,
  duration,
  volume,
  shuffle,
  repeat,
  eqPreset,
  nextTrackName,
  nextTrackArtist,
  mode,
  hover,
  fmt,
  progressPct,
  volPct,
  volLabel,
  isVideoCover,
  videoCoverSrc,
  pipAlpha,
  showMain,
  send,
  onProgressClick,
  onVolumeInput,
  selectEqPreset
} = state;
</script>

<template>
  <div
    class="fixed inset-0 z-0 transition-opacity duration-300 select-none bg-bg-base"
    :style="{ opacity: pipAlpha }"
  ></div>

  <div
    class="relative z-10 flex flex-col w-full h-full select-none"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
    @dblclick="showMain"
  >
    <!-- Minimal -->
    <template v-if="mode === 'm'">
      <div class="flex flex-row items-center h-full px-1.5 gap-1">
        <span class="text-[11px] font-medium truncate flex-1 min-w-0 text-fg-base">{{
          trackName
        }}</span>
        <div class="flex items-center gap-0.5 shrink-0">
          <button class="btn-pip w-5 h-5" @click="send('prev')">&#x23EE;</button>
          <button class="btn-pip btn-play w-5 h-5" @click="send('playPause')">
            {{ isPlaying ? '\u23F8' : '\u25B6' }}
          </button>
          <button class="btn-pip w-5 h-5" @click="send('next')">&#x23ED;</button>
          <button class="btn-pip w-4.5 h-4.5 text-[10px] text-fg-faint" @click="send('cycleMode')">
            &#x229E;
          </button>
        </div>
      </div>
    </template>

    <!-- Medium -->
    <template v-else-if="mode === 'd'">
      <div class="flex flex-1 items-stretch">
        <div class="flex shrink-0 pt-3 pb-1 pl-2">
          <video
            v-if="isVideoCover"
            :src="videoCoverSrc"
            class="w-19 h-19 rounded-lg object-cover block"
            autoplay
            muted
            loop
            playsinline
          />
          <img
            v-else-if="coverData"
            :src="coverData"
            class="w-19 h-19 rounded-lg object-cover block"
            alt=""
          />
          <div v-else class="w-19 h-19 rounded-lg bg-bg-hover"></div>
        </div>
        <div class="flex flex-1 justify-center min-w-0 flex-col pt-1 pl-2.5 gap-0.5">
          <div class="text-xs font-semibold truncate text-fg-base">{{ trackName }}</div>
          <div class="text-[10px] text-fg-faint truncate">{{ artist }}</div>
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="text-[10px] text-fg-faint tabular-nums whitespace-nowrap">{{
              fmt(currentTime)
            }}</span>
            <span class="text-[10px] text-fg-faint opacity-40">/</span>
            <span class="text-[10px] text-fg-faint tabular-nums whitespace-nowrap">{{
              fmt(duration)
            }}</span>
          </div>
        </div>
        <div class="flex flex-col items-center justify-center gap-1 shrink-0 pr-2.5 pt-5">
          <div>
            <span
              class="text-[9px] text-fg-muted cursor-pointer px-0.5 py-0.5 rounded hover:text-fg-base hover:bg-bg-hover"
              @click="send('mute')"
              >{{ volLabel }}</span
            >
            <input
              type="range"
              class="w-max h-0.75"
              min="0"
              max="1"
              step="0.05"
              :value="volume"
              @input="onVolumeInput"
            />
            <span class="text-[10px] text-fg-faint min-w-6 text-right">{{ volPct }}</span>
          </div>
          <div class="flex items-center justify-center px-2.5 pb-1.5 pt-0.5 gap-0.5 shrink-0 h-8">
            <button
              class="btn-pip"
              :class="{ 'text-accent-base!': shuffle }"
              @click="send('shuffle')"
            >
              &#x21C4;
            </button>
            <button class="btn-pip" @click="send('prev')">&#x23EE;</button>
            <button class="btn-pip btn-play" @click="send('playPause')">
              {{ isPlaying ? '\u23F8' : '\u25B6' }}
            </button>
            <button class="btn-pip" @click="send('next')">&#x23ED;</button>
            <button
              class="btn-pip"
              :class="{ 'text-accent-base!': repeat !== 'none' }"
              @click="send('repeat')"
            >
              <span class="relative"
                >&#x21BB;<span
                  v-if="repeat === 'one'"
                  class="absolute inset-0 flex items-center justify-center text-[8px] font-bold"
                  >1</span
                ></span
              >
            </button>
          </div>
        </div>
      </div>
      <div class="absolute top-1 right-1 z-10">
        <button class="btn-pip w-4.5 h-4.5 text-[10px] text-fg-faint" @click="send('cycleMode')">
          &#x229E;
        </button>
      </div>
    </template>

    <!-- Max -->
    <PipModeMax
      v-else-if="mode === 'x'"
      :is-video-cover="isVideoCover"
      :video-cover-src="videoCoverSrc"
      :cover-data="coverData"
      :track-name="trackName"
      :artist="artist"
      :next-track-name="nextTrackName"
      :next-track-artist="nextTrackArtist"
      :fmt="fmt"
      :current-time="currentTime"
      :duration="duration"
      :shuffle="shuffle"
      :repeat="repeat"
      :is-playing="isPlaying"
      :eq-preset="eqPreset"
      :volume="volume"
      :vol-pct="volPct"
      :vol-label="volLabel"
      :send="send"
      :select-eq-preset="selectEqPreset"
      :set-canvas="viz.setCanvas"
    />

    <!-- Wide -->
    <PipModeWide
      v-else
      :track-name="trackName"
      :fmt="fmt"
      :current-time="currentTime"
      :duration="duration"
      :shuffle="shuffle"
      :repeat="repeat"
      :is-playing="isPlaying"
      :eq-preset="eqPreset"
      :volume="volume"
      :vol-pct="volPct"
      :vol-label="volLabel"
      :send="send"
      :select-eq-preset="selectEqPreset"
    />
  </div>

  <div
    class="fixed bottom-0 left-0 right-0 h-0.75 bg-bg-hover cursor-pointer z-20 hover:h-1.5 hover:bg-bg-active transition-all duration-150"
    @click="onProgressClick"
  >
    <div
      class="h-full bg-accent-base w-0 rounded-r transition-[width]"
      :style="{ width: progressPct + '%' }"
    ></div>
  </div>
</template>
