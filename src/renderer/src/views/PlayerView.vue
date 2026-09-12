<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
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

const pip = usePiP({
  onClosed(savedTime) {
    player.pipActive = false;
    player.pipTime = 0;
    if (vp.videoRef.value) {
      vp.videoRef.value.currentTime = savedTime;
      player.currentTime = savedTime;
      vp.videoRef.value.play().catch(() => {});
    }
    player.isPlaying = true;
    vp.syncSubtitlesWithPiP();
  },
  onEnded() {
    if (player.queue.length > 0) {
      player.nextTrack();
    } else {
      pip.stop();
    }
  },
  onMaximize(time) {
    player.pipActive = false;
    player.pipTime = 0;
    if (vp.videoRef.value) {
      vp.videoRef.value.currentTime = time;
      player.currentTime = time;
      vp.videoRef.value.play().catch(() => {});
    }
    player.isPlaying = true;
    vp.syncSubtitlesWithPiP();
    ctl.toggleFullscreen();
  }
});

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

let wheelHandler: ((e: WheelEvent) => void) | null = null;

onMounted(() => {
  if (
    !player.currentTrack ||
    (player.currentTrack.type !== 'video' && player.currentTrack.type !== 'audio')
  ) {
    router.replace('/');
    return;
  }

  // Imperative listener: fixed Vue @wheel bindings register non-passive
  // listeners implicitly. A passive listener only observes — the handler
  // skips areas flagged with [data-wheel-ignore] instead of preventDefault().
  const container = playerContainerRef.value;
  if (container) {
    wheelHandler = (e: WheelEvent) => ctl.onWheel(e);
    container.addEventListener('wheel', wheelHandler, { passive: true });
  }

  vp.init(player.currentTrack);

  // The app-level keydown handler (App.vue) stays installed forever; here we
  // only (de)register the action context it dispatches to.
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
  if (wheelHandler) {
    playerContainerRef.value?.removeEventListener('wheel', wheelHandler);
    wheelHandler = null;
  }
  ctl.cleanup();
  vp.destroy();
  document.body.style.cursor = 'default';
  // clear the currently played video on exit so the same file can be reopened
  if (player.currentTrack?.type === 'video' && !player.pipActive) {
    player.currentTrack = null;
    player.isPlaying = false;
  }
});
</script>

<template>
  <div
    ref="playerContainerRef"
    class="player-container flex flex-col h-full bg-neutral relative"
    @mousemove="ctl.onMouseMove"
  >
    <PlayerTopBar
      :show-controls="ctl.showControls.value"
      :track="player.currentTrack"
      @back="router.back"
      @pip="vp.togglePiP"
      @fullscreen="ctl.toggleFullscreen"
    />

    <!-- video area -->
    <div v-if="isVideo" class="relative flex-1 flex items-center justify-center overflow-hidden">
      <video
        :ref="vp.onVideoRef"
        class="w-full h-full object-contain cursor-pointer"
        :style="vp.videoFilterStyle.value"
        crossorigin="anonymous"
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

      <!-- skip left zone -->
      <div
        class="absolute left-0 top-0 bottom-0 w-[20%] z-10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
        @click="ctl.skip(-10)"
      >
        <div
          class="bg-neutral/50 rounded-full px-4 py-2 text-neutral-content text-sm font-medium pointer-events-none"
        >
          -10s
        </div>
      </div>

      <!-- skip right zone -->
      <div
        class="absolute right-0 top-0 bottom-0 w-[20%] z-10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
        @click="ctl.skip(10)"
      >
        <div
          class="bg-neutral/50 rounded-full px-4 py-2 text-neutral-content text-sm font-medium pointer-events-none"
        >
          +10s
        </div>
      </div>

      <ResumePrompt
        v-if="player.resumePrompt"
        :position="player.resumePrompt.position"
        @continue="ctl.onResumeContinue"
        @start="ctl.onResumeStart"
      />
    </div>

    <!-- audio area -->
    <div
      v-else-if="isAudio"
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
        class="fx-noise mt-4 px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm"
        @click="router.push('/explorer')"
      >
        {{ $t('playerView.browseFiles') }}
      </button>
    </div>

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
