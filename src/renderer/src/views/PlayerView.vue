<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { logger } from '@shared/logger';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUIStore } from '@renderer/stores/ui';
import PlayerTopBar from '@renderer/components/player/PlayerTopBar.vue';
import PlayerControls from '@renderer/components/player/PlayerControls.vue';
import ResumePrompt from '@renderer/components/player/ResumePrompt.vue';
import AudioCover from '@renderer/components/audio/AudioCover.vue';
import AudioVisualizer from '@renderer/components/audio/AudioVisualizer.vue';
import { usePiP } from '@renderer/composables/usePiP';
import { useVideoPlayer } from '@renderer/composables/useVideoPlayer';
import { usePluginsStore } from '@renderer/stores/plugins';
import { setPlayerShortcutCtx } from '@renderer/composables/playerShortcutHandler';
import { setPlayerPiPHandler } from '@renderer/composables/playerPiPHandler';
import { usePlayerControls } from '@renderer/composables/usePlayerControls';
import { usePlayerContextMenu } from '@renderer/composables/usePlayerContextMenu';

const { t } = useI18n();
const player = usePlayerStore();
const settings = useSettingsStore();
const ui = useUIStore();
const router = useRouter();
const pluginsStore = usePluginsStore();
const playerContextMenu = usePlayerContextMenu();

const coverDecoration = computed(() => pluginsStore.decorations.cover);

const playerContainerRef = ref<HTMLDivElement | null>(null);

const isVideo = computed(() => player.currentTrack?.type === 'video');
const isAudio = computed(() => player.currentTrack?.type === 'audio');

// Wspólny powrót z PiP — onClosed i onMaximize różniły się wyłącznie pełnym ekranem.
function resumeFromPiP(time: number): void {
  player.exitPiP(time);
  const video = vp.videoRef.value;
  if (video) {
    video.currentTime = time;
    video.play().catch(() => {
      /* best-effort */
    });
  }
  vp.syncSubtitlesWithPiP();
}

const pip = usePiP({
  onClosed(savedTime) {
    resumeFromPiP(savedTime);
  },
  onMaximize(time) {
    resumeFromPiP(time);
    ctl.toggleFullscreen();
  }
});

// Strefy przewijania przy krawędziach wideo — jeden helper zamiast dwóch kopii.
const skipZones = [
  { side: 'left', seconds: -10 },
  { side: 'right', seconds: 10 }
] as const;

const vp = useVideoPlayer({
  player,
  settings,
  pip,
  notify: (text: string, duration?: number) => ctl.showToast(text, duration)
});

const ctl = usePlayerControls({ player, settings, ui, t, vp, playerContainerRef });

const onFullscreenChange = () => {
  ctl.isFullscreen.value = !!document.fullscreenElement;
};

// „Wstecz" bez wpisu w historii (np. plik otwarty ze skojarzenia systemowego) nie może
// być martwym przyciskiem — wracamy do Home.
function goBack(): void {
  if (window.history.state?.back) router.back();
  else router.push('/');
}

const wheelAbort = new AbortController();

onMounted(() => {
  if (
    !player.currentTrack ||
    (player.currentTrack.type !== 'video' && player.currentTrack.type !== 'audio')
  ) {
    router.replace('/');
    return;
  }

  // Nasłuch imperatywny: stałe wiązania Vue @wheel rejestrują domyślnie
  // nasłuchy non-passive. Nasłuch pasywny tylko obserwuje — handler
  // pomija obszary oznaczone [data-wheel-ignore] zamiast preventDefault().
  const container = playerContainerRef.value;
  if (container) {
    container.addEventListener('wheel', ctl.onWheel, {
      passive: true,
      signal: wheelAbort.signal
    });
  }

  vp.init(player.currentTrack);

  // Handler keydown na poziomie aplikacji (App.vue) pozostaje zainstalowany na stałe;
  // tutaj tylko (de)rejestrujemy kontekst akcji, do którego przekazuje zdarzenia.
  setPlayerShortcutCtx({
    player,
    settings,
    getVideoRef: () => vp.videoRef.value,
    skip: ctl.skip,
    setSpeed: ctl.setSpeed,
    toggleFullscreen: ctl.toggleFullscreen,
    notify: ctl.showToast,
    t
  });
  setPlayerPiPHandler(vp.togglePiP);

  document.addEventListener('fullscreenchange', onFullscreenChange);

  if (player.pendingFullscreen) {
    player.pendingFullscreen = false;
    nextTick(() => ctl.toggleFullscreen());
  }
});

onUnmounted(() => {
  setPlayerShortcutCtx(null);
  setPlayerPiPHandler(null);
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  // `AbortController` usuwa listener niezależnie od tego, czy template ref jest już null.
  wheelAbort.abort();
  // Wyjście z odtwarzacza podczas grania wideo nie może zabijać odtwarzania: przekaż je
  // do okna Picture-in-Picture (dokładnie tak, jak zrobiłby to przycisk PiP)
  // zamiast czyścić utwór. Wywoływane przed `vp.destroy()`, żeby bieżąca
  // pozycja odtwarzania została pobrana z żywego <video>.
  const autoPiP = player.currentTrack?.type === 'video' && !player.pipActive && player.isPlaying;
  if (autoPiP) void vp.togglePiP();

  if (
    vp.videoRef.value &&
    player.currentTrack?.type === 'video' &&
    vp.videoRef.value.currentTime > 5
  ) {
    window.api
      ?.setPlaybackPosition(player.currentTrack.path, vp.videoRef.value.currentTime)
      .catch((e) => logger.warn('player', 'saving playback position failed', e));
  }

  ctl.cleanup();
  vp.destroy();
  document.body.style.cursor = 'default';
  // wyczyść aktualnie odtwarzane wideo przy wyjściu, żeby ten sam plik można było
  // otworzyć ponownie (ale nie gdy właśnie przekazano je do PiP lub gdy PiP był już aktywny)
  if (!autoPiP && player.currentTrack?.type === 'video' && !player.pipActive) {
    player.clearTrack();
  }
});
</script>

<template>
  <div
    ref="playerContainerRef"
    data-testid="player-view"
    class="player-container flex flex-col h-full bg-neutral relative"
    @mousemove="ctl.onMouseMove"
  >
    <PlayerTopBar
      :show-controls="ctl.showControls.value"
      :track="player.currentTrack"
      @back="goBack"
      @pip="vp.togglePiP"
      @fullscreen="ctl.toggleFullscreen"
    />

    <!-- obszar wideo -->
    <div v-if="isVideo" class="relative flex-1 flex items-center justify-center overflow-hidden">
      <video
        :ref="vp.onVideoRef"
        class="w-full h-full object-contain cursor-pointer"
        :style="vp.videoFilterStyle.value"
        crossorigin="anonymous"
        :aria-label="player.currentTrack?.metadata?.title || player.currentTrack?.name"
        @click="ctl.handleClick"
        @dblclick="ctl.handleDoubleClick"
        @contextmenu="
          playerContextMenu.showVideoMenu($event, {
            vp,
            setSpeed: ctl.setSpeed,
            currentSpeed: settings.playback.playbackSpeed
          })
        "
      />

      <button
        v-for="zone in skipZones"
        :key="zone.side"
        type="button"
        class="absolute top-0 bottom-0 w-[20%] z-10 flex items-center justify-center opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        :class="zone.side === 'left' ? 'left-0' : 'right-0'"
        :aria-label="
          zone.seconds < 0 ? $t('playerView.seekBackward') : $t('playerView.seekForward')
        "
        @click="ctl.skip(zone.seconds)"
      >
        <span
          class="bg-neutral/50 rounded-full px-4 py-2 text-neutral-content text-sm font-medium pointer-events-none"
        >
          {{ zone.seconds > 0 ? `+${zone.seconds}s` : `${zone.seconds}s` }}
        </span>
      </button>
    </div>

    <!-- obszar audio -->
    <div
      v-else-if="isAudio"
      data-testid="player-audio-surface"
      class="relative flex-1 flex flex-col items-center justify-center gap-6 overflow-hidden bg-base-200/(--glass-alpha)"
      @contextmenu="
        playerContextMenu.showAudioMenu($event, {
          setSpeed: ctl.setSpeed,
          currentSpeed: settings.playback.playbackSpeed
        })
      "
    >
      <AudioCover size="w-72 h-72" variant="rounded" :decoration="coverDecoration" />
      <div class="text-center pointer-events-none">
        <p class="text-lg text-base-content">
          {{ player.currentTrack?.metadata?.title || player.currentTrack?.name }}
        </p>
        <p class="text-sm text-base-content/70">
          {{ player.currentTrack?.metadata?.artist || '' }}
        </p>
      </div>
      <div class="w-full max-w-2xl px-8">
        <AudioVisualizer class="w-full h-24 rounded-box overflow-hidden" />
      </div>
    </div>

    <div v-else class="relative flex-1 flex items-center justify-center overflow-hidden">
      <p class="text-lg text-neutral-content/60">{{ $t('playerView.noVideo') }}</p>
      <button
        type="button"
        class="fx-noise mt-4 px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm"
        @click="router.push('/explorer')"
      >
        {{ $t('playerView.browseFiles') }}
      </button>
    </div>

    <ResumePrompt
      v-if="player.resumePrompt"
      :position="player.resumePrompt.position"
      @continue="ctl.onResumeContinue"
      @start="ctl.onResumeStart"
    />

    <PlayerControls
      :show-controls="ctl.showControls.value"
      :speed="settings.playback.playbackSpeed"
      :video-ref="vp.videoRef"
      @seek="ctl.onSeek"
      @volume-change="ctl.onVolumeChange"
      @set-speed="ctl.setSpeed"
      @skip="ctl.skip"
    />
  </div>
</template>

<style scoped>
.player-container:fullscreen {
  width: 100vw;
  height: 100vh;
}
.player-container:fullscreen.hide-cursor,
.player-container:fullscreen.hide-cursor * {
  cursor: none !important;
}
.player-container:fullscreen video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
