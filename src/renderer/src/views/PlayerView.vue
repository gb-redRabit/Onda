<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { useRouter } from 'vue-router';
import PlayerOSD from '@renderer/components/player/PlayerOSD.vue';
import PlayerTopBar from '@renderer/components/player/PlayerTopBar.vue';
import PlayerControls from '@renderer/components/player/PlayerControls.vue';
import ResumePrompt from '@renderer/components/player/ResumePrompt.vue';
import { usePiP } from '@renderer/composables/usePiP';
import { useVideoPlayer } from '@renderer/composables/useVideoPlayer';
import { usePlayerKeyboard } from '@renderer/composables/usePlayerKeyboard';

const player = usePlayerStore();
const settings = useSettingsStore();
const router = useRouter();

const playerContainerRef = ref<HTMLDivElement | null>(null);
const isFullscreen = ref(false);
const showControls = ref(true);
const controlsTimeout = ref<ReturnType<typeof setTimeout> | null>(null);

const osdVisible = ref(false);
const osdText = ref('');
const osdIcon = ref<'play' | 'pause' | 'volume' | 'seek' | 'track' | 'speed'>('track');
const osdTimeout = ref<ReturnType<typeof setTimeout> | null>(null);

const isVideo = computed(() => player.currentTrack?.type === 'video');
const isAudio = computed(() => player.currentTrack?.type === 'audio');

let resumePromptTimer: ReturnType<typeof setTimeout> | null = null;

function showOSD(text: string, icon: typeof osdIcon.value = 'track', duration = 1500) {
  osdText.value = text;
  osdIcon.value = icon;
  osdVisible.value = true;
  if (osdTimeout.value) clearTimeout(osdTimeout.value);
  osdTimeout.value = setTimeout(() => {
    osdVisible.value = false;
  }, duration);
}

const pip = usePiP({
  onClosed(savedTime) {
    player.pipActive = false;
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
  }
});

const vp = useVideoPlayer({ player, settings, pip, showOSD });

function onWheel(e: WheelEvent) {
  e.preventDefault();
  if (!vp.videoRef.value) return;
  const delta = e.deltaY < 0 ? 0.05 : -0.05;
  const newVol = Math.max(0, Math.min(1, player.volume + delta));
  player.setVolume(newVol);
  vp.videoRef.value.volume = player.isMuted ? 0 : newVol;
  showOSD(`Glosnosc: ${Math.round(newVol * 100)}%`, 'volume', 1200);
}

function onSeek(time: number) {
  if (!vp.videoRef.value) return;
  player.seek(time);
  vp.videoRef.value.currentTime = time;
}

function onVolumeChange(value: number) {
  player.setVolume(value);
  if (vp.videoRef.value) vp.videoRef.value.volume = player.isMuted ? 0 : value;
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    const target = playerContainerRef.value || document.documentElement;
    target.requestFullscreen().catch(() => {
      document.documentElement.requestFullscreen();
    });
  } else {
    document.exitFullscreen();
  }
}

function skip(seconds: number) {
  if (!vp.videoRef.value) return;
  const newTime = Math.max(
    0,
    Math.min(vp.videoRef.value.duration || 0, vp.videoRef.value.currentTime + seconds)
  );
  vp.videoRef.value.currentTime = newTime;
  player.currentTime = newTime;
  const sign = seconds > 0 ? '+' : '';
  showOSD(`${sign}${seconds}s`, 'seek', 1000);
}

function setSpeed(speed: number) {
  const clamped = Math.round(Math.max(0.2, Math.min(3, speed)) * 10) / 10;
  settings.updatePlayback({ playbackSpeed: clamped });
  if (vp.videoRef.value) vp.videoRef.value.playbackRate = clamped;
  showOSD(`${clamped}x`, 'speed', 1200);
}

function onMouseMove() {
  showControls.value = true;
  if (settings.playback.cursorHide && isFullscreen.value && playerContainerRef.value) {
    playerContainerRef.value.classList.remove('hide-cursor');
  }
  if (controlsTimeout.value) clearTimeout(controlsTimeout.value);
  controlsTimeout.value = setTimeout(() => {
    if (player.isPlaying) {
      showControls.value = false;
      if (settings.playback.cursorHide && isFullscreen.value && playerContainerRef.value) {
        playerContainerRef.value.classList.add('hide-cursor');
      }
    }
  }, settings.playback.cursorTimeout * 1000);
}

let clickTimer: ReturnType<typeof setTimeout> | null = null;

function handleClick() {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
    toggleFullscreen();
    return;
  }
  clickTimer = setTimeout(() => {
    if (player.pipActive) return;

    player.togglePlay();
    showOSD(
      player.isPlaying ? 'Odtwarzanie' : 'Wstrzymano',
      player.isPlaying ? 'play' : 'pause',
      1000
    );
    clickTimer = null;
  }, 250);
}

function onResumeContinue() {
  const prompt = player.resumePrompt;
  if (prompt && vp.videoRef.value) {
    vp.videoRef.value.currentTime = prompt.position;
    player.currentTime = prompt.position;
    vp.videoRef.value.play().catch(() => {});
    window.api.setPlaybackPosition(prompt.path, prompt.position);
  }
  player.clearResumePrompt();
}

function onResumeStart() {
  const prompt = player.resumePrompt;
  if (prompt) window.api.clearPlaybackPosition(prompt.path);
  player.clearResumePrompt();
}

watch(
  () => player.resumePrompt,
  (prompt) => {
    if (resumePromptTimer) {
      clearTimeout(resumePromptTimer);
      resumePromptTimer = null;
    }
    if (prompt) {
      resumePromptTimer = setTimeout(() => {
        player.clearResumePrompt();
      }, 7000);
    }
  }
);

onMounted(() => {
  if (
    !player.currentTrack ||
    (player.currentTrack.type !== 'video' && player.currentTrack.type !== 'audio')
  ) {
    router.replace('/');
    return;
  }

  vp.init(player.currentTrack);

  usePlayerKeyboard({
    player,
    settings,
    vp,
    showOSD,
    skip,
    setSpeed,
    toggleFullscreen
  });

  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement;
  });
});

onUnmounted(() => {
  if (resumePromptTimer) clearTimeout(resumePromptTimer);
  vp.destroy();
  if (controlsTimeout.value) clearTimeout(controlsTimeout.value);
  if (osdTimeout.value) clearTimeout(osdTimeout.value);
  if (clickTimer) clearTimeout(clickTimer);
  document.body.style.cursor = 'default';
});
</script>

<template>
  <div
    ref="playerContainerRef"
    class="player-container flex flex-col h-full bg-black relative"
    @mousemove="onMouseMove"
    @wheel.prevent="onWheel"
  >
    <PlayerOSD :visible="osdVisible" :text="osdText" :icon="osdIcon" />

    <PlayerTopBar
      :show-controls="showControls"
      :track="player.currentTrack"
      @back="router.back"
      @pip="vp.togglePiP"
      @fullscreen="toggleFullscreen"
    />

    <!-- video area -->
    <div v-if="isVideo" class="relative flex-1 flex items-center justify-center overflow-hidden">
      <video
        :ref="vp.onVideoRef"
        class="w-full h-full object-contain cursor-pointer"
        :style="vp.videoFilterStyle.value"
        @click="handleClick"
      />

      <!-- skip left zone -->
      <div
        class="absolute left-0 top-0 bottom-0 w-[20%] z-10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
        @click="skip(-10)"
      >
        <div
          class="bg-black/50 rounded-full px-4 py-2 text-white text-sm font-medium pointer-events-none"
        >
          -10s
        </div>
      </div>

      <!-- skip right zone -->
      <div
        class="absolute right-0 top-0 bottom-0 w-[20%] z-10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
        @click="skip(10)"
      >
        <div
          class="bg-black/50 rounded-full px-4 py-2 text-white text-sm font-medium pointer-events-none"
        >
          +10s
        </div>
      </div>

      <ResumePrompt
        v-if="player.resumePrompt"
        :position="player.resumePrompt.position"
        @continue="onResumeContinue"
        @start="onResumeStart"
      />
    </div>

    <!-- audio area -->
    <div
      v-else-if="isAudio"
      class="relative flex-1 flex items-center justify-center overflow-hidden bg-bg-base"
    >
      <div class="text-center">
        <p class="text-lg text-fg-base">
          {{ player.currentTrack?.metadata?.title || player.currentTrack?.name }}
        </p>
        <p class="text-sm text-fg-muted">{{ player.currentTrack?.metadata?.artist || '' }}</p>
      </div>
    </div>

    <div v-else class="relative flex-1 flex items-center justify-center overflow-hidden">
      <p class="text-lg text-white/60">Brak wideo do odtworzenia</p>
      <button
        class="mt-4 px-4 py-2 rounded-xl bg-accent-base text-white text-sm"
        @click="router.push('/explorer')"
      >
        Przegladaj pliki
      </button>
    </div>

    <PlayerControls
      :show-controls="showControls"
      :speed="settings.playback.playbackSpeed"
      @seek="onSeek"
      @volume-change="onVolumeChange"
      @set-speed="setSpeed"
      @skip="skip"
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
