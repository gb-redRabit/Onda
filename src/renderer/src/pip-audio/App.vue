<script setup lang="ts">
import { computed } from 'vue';
import { usePipVisualizer } from './usePipVisualizer';
import { usePipAudioState, EQ_PRESETS } from './usePipAudioState';
import PipCover from './PipCover.vue';
import {
  ROOT_BG,
  EDGE_BORDER,
  BTN,
  BTN_PLAY,
  BTN_ACTIVE,
  BTN_EDGE,
  BTN_PLAY_EDGE,
  VOL_LABEL,
  EQ_BTN,
  EQ_BTN_ON,
  PEEK_TRACK,
  PEEK_FILL,
  EDGE_PROGRESS_TRACK_H,
  EDGE_PROGRESS_TRACK_V,
  EDGE_PROGRESS_FILL_H,
  EDGE_PROGRESS_FILL_V
} from './pipTheme';

const handlers = { updateAccent: () => {} };
const state = usePipAudioState(handlers);
const viz = usePipVisualizer(state.vizData, state.isVertical);
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
  dock,
  layoutKind,
  edge,
  peeked,
  has,
  fmt,
  progressPct,
  volPct,
  volLabel,
  isVideoCover,
  videoCoverSrc,
  showMain,
  send,
  onProgressClick,
  onVolumeInput,
  selectEqPreset
} = state;

function onRootDblClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (t.closest('button, input')) return;
  showMain();
}

const rootClass = computed(() => {
  if (peeked.value && edge.value) return 'border-0 bg-transparent';
  const inner = (() => {
    switch (dock.value) {
      case 'top':
        return 'rounded-none border-x-0 border-t-0 border-b-[length:var(--border)]';
      case 'bottom':
        return 'rounded-none border-x-0 border-b-0 border-t-[length:var(--border)]';
      case 'left':
        return 'rounded-none border-y-0 border-l-0 border-r-[length:var(--border)]';
      case 'right':
        return 'rounded-none border-y-0 border-r-0 border-l-[length:var(--border)]';
      default:
        return 'rounded-[var(--radius-box)] border-[length:var(--border)]';
    }
  })();
  return `${ROOT_BG} ${EDGE_BORDER} ${inner}`;
});

/* ---------- Zwinięty pasek na krawędzi ---------- */
const peekAlign = computed(() => {
  switch (edge.value) {
    case 'top':
      return 'items-end';
    case 'bottom':
      return 'items-start';
    case 'left':
      return 'justify-end';
    case 'right':
      return 'justify-start';
    default:
      return '';
  }
});
const peekTrackGeom = computed(() =>
  edge.value === 'left' || edge.value === 'right' ? 'h-full w-[5px]' : 'h-[5px] w-full'
);
const peekFillGeom = computed(() =>
  edge.value === 'left' || edge.value === 'right' ? 'absolute bottom-0 left-0 w-full' : 'h-full'
);
const peekFillState = computed(() =>
  isPlaying.value
    ? 'shadow-[0_0_8px_color-mix(in_srgb,var(--color-primary)_85%,transparent)]'
    : 'opacity-45'
);

/* ---------- Pasek postępu na krawędzi w trybie rozwiniętym (jak w schowanym) ---------- */
</script>

<template>
  <div
    class="pip-fade-in relative box-border h-full w-full overflow-hidden"
    :class="rootClass"
    @dblclick="onRootDblClick"
  >
    <!-- ===== ZWINIĘTY (krawędź + auto-hide): sam pasek postępu na wystającej krawędzi ===== -->
    <div v-if="peeked && edge" class="flex h-full w-full" :class="peekAlign">
      <div
        class="group"
        :class="[PEEK_TRACK, peekTrackGeom]"
        @click="onProgressClick"
        @dblclick.stop
      >
        <div
          :class="[PEEK_FILL, peekFillGeom, peekFillState]"
          :style="
            edge === 'left' || edge === 'right'
              ? { height: progressPct + '%' }
              : { width: progressPct + '%' }
          "
        ></div>
      </div>
    </div>

    <template v-else>
      <!-- Wizualizacja w tle (jeśli włączona; na bokach obrócona o 90°) -->
      <canvas
        v-if="has('viz')"
        :ref="viz.setCanvas"
        class="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-40"
      ></canvas>

      <!-- ===== KARTA (rogi) ===== -->
      <div
        v-if="layoutKind === 'card'"
        class="relative z-10 flex h-full w-full select-none items-stretch gap-2 px-2.5 py-1.5"
      >
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
            <button
              :class="[BTN, repeat !== 'none' ? BTN_ACTIVE : '']"
              @click.stop="send('repeat')"
            >
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

      <!-- ===== PASEK POZIOMY (top/bottom, pełna szerokość) ===== -->
      <div
        v-else-if="layoutKind === 'bar-h'"
        class="relative z-10 flex h-full w-full select-none flex-col"
      >
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
              <span class="truncate text-[12px] font-semibold text-base-content">{{
                trackName
              }}</span>
              <span v-if="artist" class="truncate text-[10px] text-base-content/50">{{
                artist
              }}</span>
            </template>
            <span
              v-if="has('nextTrack') && nextTrackName"
              class="truncate text-[10px] text-base-content/40"
            >
              &#x21B3; {{ nextTrackName }}{{ nextTrackArtist ? ' — ' + nextTrackArtist : '' }}
            </span>
          </div>

          <div
            v-if="has('controls')"
            class="mx-auto flex shrink-0 items-center gap-1"
            @dblclick.stop
          >
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

      <!-- ===== PASEK PIONOWY (left/right, pełna wysokość) ===== -->
      <div v-else class="relative z-10 flex h-full w-full select-none">
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

          <div
            v-if="has('trackInfo')"
            class="max-h-[26%] px-1 text-center [writing-mode:vertical-rl]"
          >
            <span class="truncate text-[11px] font-semibold text-base-content">{{
              trackName
            }}</span>
          </div>
          <div
            v-if="has('nextTrack') && nextTrackName"
            class="max-h-[18%] px-1 text-center [writing-mode:vertical-rl]"
          >
            <span class="truncate text-[9px] text-base-content/40"
              >&#x21B3; {{ nextTrackName }}</span
            >
          </div>

          <div
            v-if="has('controls')"
            class="flex shrink-0 flex-col items-center gap-1"
            @dblclick.stop
          >
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

          <div
            v-if="has('volume')"
            class="flex shrink-0 flex-col items-center gap-1"
            @dblclick.stop
          >
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
  </div>
</template>
