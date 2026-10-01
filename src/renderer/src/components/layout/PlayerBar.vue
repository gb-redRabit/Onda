<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Volume2,
  VolumeX,
  Volume1,
  Heart,
  ListMusic,
  SlidersHorizontal,
  Minimize2,
  Disc3
} from '@lucide/vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { formatDuration } from '@renderer/utils/formatters';
import MediaCover from '@renderer/components/MediaCover.vue';
import TrackInfo from '@renderer/components/TrackInfo.vue';
import { usePluginsStore } from '@renderer/stores/plugins';
import PlayerBarMini from './PlayerBarMini.vue';
import TransportButtons from '@renderer/components/player/TransportButtons.vue';

const player = usePlayerStore();
const audio = useAudioPlayer();
const router = useRouter();
const pluginsStore = usePluginsStore();
const isMini = ref(false);

const COVER_SHAPE_CLIP: Record<string, string> = {
  circle: 'circle(50%)',
  triangle: 'polygon(50% 0%, 0% 100%, 100% 100%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  hexagon: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)'
};

const coverClip = computed(() => {
  const dec = pluginsStore.decorations.cover;
  return dec && dec !== 'none' ? COVER_SHAPE_CLIP[dec] : undefined;
});

// While a YouTube stream URL resolves, the bar shows the pending track
// immediately instead of waiting for the (1-2 s) resolution.
const displayTrack = computed(() => player.currentTrack ?? player.streamPending);

const progressPct = computed(() =>
  audio.duration.value > 0 ? (audio.currentTime.value / audio.duration.value) * 100 : 0
);

// Live radio stations are 'stream' tracks without a duration: no seek bar, no
// time counter — just a "LIVE" badge.
const isLive = computed(
  () =>
    player.currentTrack?.type === 'stream' &&
    !!player.currentTrack?.id.startsWith('radio:') &&
    !player.currentTrack?.duration
);

const bufferedPct = computed(() => audio.buffered.value * 100);

function onSeek(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const time = ((e.clientX - rect.left) / rect.width) * audio.duration.value;
  audio.seek(time);
}

function onVolume(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  audio.setVolume((e.clientX - rect.left) / rect.width);
}

function onSeekKeydown(e: KeyboardEvent) {
  const step = e.shiftKey ? 30 : 5;
  const current = audio.currentTime.value;
  const duration = audio.duration.value;
  const next =
    e.key === 'ArrowLeft'
      ? current - step
      : e.key === 'ArrowRight'
        ? current + step
        : e.key === 'PageDown'
          ? current - 30
          : e.key === 'PageUp'
            ? current + 30
            : e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? duration
                : null;
  if (next === null) return;
  e.preventDefault();
  audio.seek(Math.max(0, Math.min(duration, next)));
}

function onVolumeKeydown(e: KeyboardEvent) {
  const step = e.shiftKey ? 0.1 : 0.05;
  const next =
    e.key === 'ArrowDown' || e.key === 'ArrowLeft'
      ? player.volume - step
      : e.key === 'ArrowUp' || e.key === 'ArrowRight'
        ? player.volume + step
        : e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? 1
            : null;
  if (next === null) return;
  e.preventDefault();
  audio.setVolume(Math.max(0, Math.min(1, next)));
}

function togglePlay() {
  if (audio.isPlaying.value) {
    audio.pause();
  } else {
    audio.play();
  }
}
</script>

<template>
  <!-- mini player -->
  <PlayerBarMini
    v-if="isMini"
    :display-track="displayTrack"
    :cover-clip="coverClip"
    :progress-pct="progressPct"
    :buffered-pct="bufferedPct"
    :is-live="isLive"
    @seek="onSeek"
    @toggle-play="togglePlay"
    @audio-view="router.push('/audio')"
    @expand="isMini = false"
  />

  <!-- full player -->
  <div
    v-else
    data-testid="player-bar"
    :data-playing="audio.isPlaying.value ? 'true' : 'false'"
    class="h-18 bg-base-200/(--glass-alpha) border border-t border-base-content/20 flex items-center px-4 shrink-0 relative"
  >
    <div
      v-if="!isLive"
      class="absolute top-0 left-0 right-0 h-1 bg-border-default/50 cursor-pointer hover:h-1.5 group transition-[height] z-10"
      role="slider"
      tabindex="0"
      :aria-label="$t('playerView.seek')"
      :aria-valuemin="0"
      :aria-valuemax="audio.duration.value"
      :aria-valuenow="audio.currentTime.value"
      :aria-valuetext="`${formatDuration(audio.currentTime.value)} / ${formatDuration(audio.duration.value)}`"
      @click="onSeek"
      @keydown="onSeekKeydown"
    >
      <div
        class="absolute inset-y-0 left-0 h-full bg-primary/50 rounded-r-full"
        :style="{ width: bufferedPct + '%' }"
      />
      <div
        class="absolute inset-y-0 left-0 h-full bg-primary rounded-r-full"
        :style="{ width: progressPct + '%' }"
      />
    </div>

    <div class="flex items-center gap-3 min-w-0 w-70 shrink-0 max-lg:w-56 max-md:w-44">
      <div
        class="w-11 h-11 rounded-field bg-base-100 border border-base-300 flex items-center justify-center shrink-0 overflow-hidden"
        :style="coverClip ? { clipPath: coverClip } : undefined"
      >
        <MediaCover :path="displayTrack?.path" :size="18" :autoplay="true" fallback="music" />
      </div>
      <TrackInfo
        :track="displayTrack"
        class="min-w-0 flex-1"
        titleSize="text-sm"
        titleClass="text-base-content"
        :showFallback="true"
      />
      <button
        class="shrink-0 p-1.5 transition-colors"
        :class="
          player.currentTrack && player.isFavorite(player.currentTrack.path)
            ? 'text-error'
            : 'text-base-content/50 hover:text-error'
        "
        :disabled="!player.currentTrack"
        :aria-label="
          player.currentTrack && player.isFavorite(player.currentTrack.path)
            ? $t('common.removeFav')
            : $t('common.addFav')
        "
        @click="player.currentTrack && player.toggleFavorite(player.currentTrack.path)"
      >
        <Heart
          :size="15"
          :fill="
            player.currentTrack && player.isFavorite(player.currentTrack.path)
              ? 'currentColor'
              : 'none'
          "
        />
      </button>
    </div>

    <div class="flex-1 flex flex-col items-center gap-0.5">
      <TransportButtons
        variant="bar"
        :is-playing="audio.isPlaying.value"
        :shuffle="player.shuffle"
        :repeat="player.repeat"
        @play-pause="togglePlay"
        @prev="player.prevTrack"
        @next="player.nextTrack"
        @toggle-shuffle="player.toggleShuffle"
        @cycle-repeat="player.cycleRepeat"
      />
      <div
        v-if="isLive"
        class="flex items-center gap-2 text-[11px] font-bold tracking-widest text-error"
      >
        <span>{{ $t('player.live') }}</span>
      </div>
      <div
        v-else
        class="flex items-center gap-2 text-[11px] text-base-content/50 font-mono tabular-nums"
      >
        <span>{{ formatDuration(audio.currentTime.value) }}</span>
        <span>/</span>
        <span>{{ formatDuration(audio.duration.value) }}</span>
      </div>
    </div>

    <div class="flex items-center gap-1.5 justify-end w-64 shrink-0 max-lg:w-auto">
      <button
        class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
        :class="{ 'text-primary!': player.equalizerVisible }"
        data-eq-toggle
        data-testid="player-eq"
        :aria-label="$t('common.equalizer')"
        @click="player.toggleEqualizer"
      >
        <SlidersHorizontal :size="15" />
      </button>
      <button
        class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
        :class="{ 'text-primary!': player.queueVisible }"
        data-testid="player-queue"
        :aria-label="$t('common.queue')"
        @click="player.toggleQueue"
      >
        <ListMusic :size="15" />
      </button>
      <button
        class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
        :aria-label="$t('common.mute')"
        @click="player.toggleMute"
      >
        <component
          :is="
            player.isMuted || player.volume === 0
              ? VolumeX
              : player.volume < 0.5
                ? Volume1
                : Volume2
          "
          :size="15"
        />
      </button>
      <div
        class="w-30 h-1 bg-border-default/60 rounded-full cursor-pointer hover:h-1.5 transition-[height] max-md:hidden"
        role="slider"
        tabindex="0"
        :aria-label="$t('playerView.volume')"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuenow="Math.round(player.volume * 100)"
        @click="onVolume"
        @keydown="onVolumeKeydown"
      >
        <div
          class="h-full bg-base-content rounded-full"
          :style="{ width: (player.isMuted ? 0 : player.volume * 100) + '%' }"
        />
      </div>
      <button
        class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-primary hover:bg-base-content/10 transition-colors"
        :title="$t('common.audioView')"
        :aria-label="$t('common.audioView')"
        @click="router.push('/audio')"
      >
        <Disc3 :size="15" />
      </button>
      <button
        class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
        :title="$t('common.miniPlayer')"
        :aria-label="$t('common.miniPlayer')"
        @click="isMini = true"
      >
        <Minimize2 :size="13" />
      </button>
    </div>
  </div>
</template>
