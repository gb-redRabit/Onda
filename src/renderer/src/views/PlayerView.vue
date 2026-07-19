<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { useRouter } from 'vue-router';
import PlayerOSD from '@renderer/components/player/PlayerOSD.vue';
import PlayerTopBar from '@renderer/components/player/PlayerTopBar.vue';
import PlayerControls from '@renderer/components/player/PlayerControls.vue';
import {
  initSubtitleRenderer,
  loadSubtitleTrack,
  removeSubtitleTrack,
  destroySubtitleRenderer,
  preparePiPSubtitleData
} from '@renderer/composables/useSubtitleRenderer';
import { usePiP } from '@renderer/composables/usePiP';
import { audioEngine } from '@renderer/modules/audioEngine';
import { formatDuration } from '@renderer/utils/formatters';

const player = usePlayerStore();
const settings = useSettingsStore();
const router = useRouter();

function getTrackSrc(track: { path: string }): string {
  return `file:///${track.path.replace(/\\/g, '/')}`;
}

const pip = usePiP({
  onClosed(savedTime) {
    player.pipActive = false;
    if (videoRef.value) {
      videoRef.value.currentTime = savedTime;
      player.currentTime = savedTime;
      videoRef.value.play().catch(() => {});
    }
    player.isPlaying = true;
    syncSubtitlesWithPiP();
  },
  onEnded() {
    if (player.queue.length > 0) {
      player.nextTrack();
    } else {
      pip.stop();
    }
  }
});

const videoRef = ref<HTMLVideoElement | null>(null);
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

function onResumeContinue() {
  const prompt = player.resumePrompt;
  if (prompt && videoRef.value) {
    videoRef.value.currentTime = prompt.position;
    player.currentTime = prompt.position;
    videoRef.value.play().catch(() => {});
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

const videoFilterStyle = computed(() => {
  const f = settings.playback.videoFilter;
  if (!f || f === 'none') return {};
  return { filter: f };
});

function showOSD(text: string, icon: typeof osdIcon.value = 'track', duration = 1500) {
  osdText.value = text;
  osdIcon.value = icon;
  osdVisible.value = true;
  if (osdTimeout.value) clearTimeout(osdTimeout.value);
  osdTimeout.value = setTimeout(() => {
    osdVisible.value = false;
  }, duration);
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  if (!videoRef.value) return;
  const delta = e.deltaY < 0 ? 0.05 : -0.05;
  const newVol = Math.max(0, Math.min(1, player.volume + delta));
  player.setVolume(newVol);
  videoRef.value.volume = player.isMuted ? 0 : newVol;
  showOSD(`Glosnosc: ${Math.round(newVol * 100)}%`, 'volume', 1200);
}

function onSeek(time: number) {
  if (!videoRef.value) return;
  player.seek(time);
  videoRef.value.currentTime = time;
}

function onVolumeChange(value: number) {
  player.setVolume(value);
  if (videoRef.value) videoRef.value.volume = player.isMuted ? 0 : value;
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
  if (!videoRef.value) return;
  const newTime = Math.max(
    0,
    Math.min(videoRef.value.duration || 0, videoRef.value.currentTime + seconds)
  );
  videoRef.value.currentTime = newTime;
  player.currentTime = newTime;
  const sign = seconds > 0 ? '+' : '';
  showOSD(`${sign}${seconds}s`, 'seek', 1000);
}

function setSpeed(speed: number) {
  const clamped = Math.round(Math.max(0.2, Math.min(3, speed)) * 10) / 10;
  settings.updatePlayback({ playbackSpeed: clamped });
  if (videoRef.value) videoRef.value.playbackRate = clamped;
  showOSD(`${clamped}x`, 'speed', 1200);
}

async function togglePiP() {
  if (player.pipActive) {
    pip.stop();
    return;
  }

  let src = videoRef.value?.src || '';
  if (!src && player.currentTrack) {
    src = getTrackSrc(player.currentTrack);
  }
  if (!src) return;

  const startTime = videoRef.value?.currentTime || player.currentTime;

  const started = await pip.start(src, {
    position: settings.playback.pipPosition,
    width: settings.playback.pipWidth,
    height: settings.playback.pipHeight,
    startTime,
    subtitle: true
  });
  if (started) {
    player.pipTime = startTime;
    player.pipActive = true;
    if (videoRef.value) videoRef.value.pause();
    player.isPlaying = false;
    syncSubtitlesWithPiP();
  }
}

function syncSubtitlesWithPiP(): void {
  if (player.pipActive) {
    removeSubtitleTrack();
    return;
  }
  const trackId = player.activeSubtitleId;
  if (!trackId) return;
  const track = player.subtitleTracks.find((t) => t.id === trackId);
  if (track) loadSubtitleTrack(track);
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
    console.log('[VIDEO] handleClick → calling togglePlay');
    player.togglePlay();
    showOSD(
      player.isPlaying ? 'Odtwarzanie' : 'Wstrzymano',
      player.isPlaying ? 'play' : 'pause',
      1000
    );
    clickTimer = null;
  }, 250);
}

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    return;

  switch (e.key) {
    case ' ':
    case 'k':
      e.preventDefault();
      if (player.pipActive) return;
      player.togglePlay();
      showOSD(
        player.isPlaying ? 'Odtwarzanie' : 'Wstrzymano',
        player.isPlaying ? 'play' : 'pause',
        1000
      );
      break;
    case 'ArrowLeft':
      e.preventDefault();
      skip(e.shiftKey ? -30 : -10);
      break;
    case 'ArrowRight':
      e.preventDefault();
      skip(e.shiftKey ? 30 : 10);
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (videoRef.value) {
        const newVol = Math.min(1, player.volume + 0.05);
        player.setVolume(newVol);
        videoRef.value.volume = player.isMuted ? 0 : newVol;
        showOSD(`Glosnosc: ${Math.round(newVol * 100)}%`, 'volume', 1200);
      }
      break;
    case 'ArrowDown':
      e.preventDefault();
      if (videoRef.value) {
        const newVol = Math.max(0, player.volume - 0.05);
        player.setVolume(newVol);
        videoRef.value.volume = player.isMuted ? 0 : newVol;
        showOSD(`Glosnosc: ${Math.round(newVol * 100)}%`, 'volume', 1200);
      }
      break;
    case 'm':
      e.preventDefault();
      player.toggleMute();
      showOSD(
        player.isMuted ? 'Wyciszono' : `Glosnosc: ${Math.round(player.volume * 100)}%`,
        'volume',
        1200
      );
      break;
    case 'f':
      e.preventDefault();
      toggleFullscreen();
      break;
    case '<':
      e.preventDefault();
      setSpeed(settings.playback.playbackSpeed - 0.25);
      break;
    case '>':
      e.preventDefault();
      setSpeed(settings.playback.playbackSpeed + 0.25);
      break;
    case '0':
      e.preventDefault();
      if (videoRef.value) {
        videoRef.value.currentTime = 0;
        player.currentTime = 0;
        showOSD('0:00', 'seek', 1000);
      }
      break;
  }
}

const videoEventsConnected = ref(false);

function connectVideoEvents(el: HTMLVideoElement) {
  if (videoEventsConnected.value) return;
  videoEventsConnected.value = true;
  let lastSaved = 0;
  el.addEventListener('timeupdate', () => {
    player.currentTime = el.currentTime;
    if (player.currentTrack && el.currentTime - lastSaved > 3) {
      lastSaved = el.currentTime;
      window.api.setPlaybackPosition(player.currentTrack.path, el.currentTime);
    }
  });
  el.addEventListener('durationchange', () => {
    player.duration = el.duration || 0;
    if (player.currentTrack) player.currentTrack.duration = el.duration || 0;
  });
  el.addEventListener('loadedmetadata', () => {
    player.duration = el.duration || 0;
    if (player.currentTrack) player.currentTrack.duration = el.duration || 0;
  });
  el.addEventListener('pause', () => {
    if (player.currentTrack && player.currentTrack.type === 'video') {
      window.api.setPlaybackPosition(player.currentTrack.path, el.currentTime);
    }
  });
  el.addEventListener('ended', () => {
    console.log('[VIDEO] ended event → currentTrack:', player.currentTrack?.name, 'repeat:', player.repeat, 'pipActive:', player.pipActive);
    if (player.currentTrack && player.currentTrack.type === 'video') {
      window.api.clearPlaybackPosition(player.currentTrack.path);
    }
    if (player.pipActive) return;
    if (player.repeat === 'one') {
      console.log('[VIDEO] ended → repeat=one, restarting video');
      el.currentTime = 0;
      el.play().catch(() => {});
      return;
    }
    player.isPlaying = false;
    player.nextTrack();
  });
}

function setupVideo(track: import('@renderer/types/media').MediaFile | null) {
  if (!track || track.type !== 'video' || !videoRef.value) return;
  const el = videoRef.value;
  const src = getTrackSrc(track);
  console.log('[VIDEO] setupVideo:', track.name, 'src===current:', el.getAttribute('data-src') === src);
  if (el.getAttribute('data-src') !== src) {
    const seekTo = player.pipTime > 0 ? player.pipTime : player.currentTime;
    if (player.pipTime > 0) player.pipTime = 0;
    el.setAttribute('data-src', src);
    el.src = src;
    connectVideoEvents(el);
    audioEngine.connectVideoElement(el);

    el.addEventListener(
      'canplay',
      () => {
        console.log('[VIDEO] canplay → isPlaying:', player.isPlaying, 'pipActive:', player.pipActive);
        if (player.isPlaying && !player.pipActive) {
          el.play().catch(() => {});
        }
      },
      { once: true }
    );

    el.addEventListener(
      'loadedmetadata',
      () => {
        if (seekTo > 0) el.currentTime = seekTo;
        el.playbackRate = settings.playback.playbackSpeed;
      },
      { once: true }
    );

    el.addEventListener(
      'playing',
      () => {
        player.flushPendingQueue();
      },
      { once: true }
    );

    el.load();
  } else {
    el.volume = player.isMuted ? 0 : player.volume;
    el.playbackRate = settings.playback.playbackSpeed;
    if (player.isPlaying && !player.pipActive) el.play().catch(() => {});
  }
}

let lastLoadedPath = '';

function onVideoRef(el: unknown) {
  videoRef.value = el as HTMLVideoElement;
  if (el && player.currentTrack?.type === 'video') {
    setupVideo(player.currentTrack);
    const video = el as HTMLVideoElement;
    const tryInit = () => {
      if (!video.isConnected) {
        nextTick(tryInit);
        return;
      }
      initSubtitleRenderer(video);
      if (player.currentTrack && player.currentTrack.path !== lastLoadedPath) {
        if (video.readyState >= 1 || video.videoWidth > 0) {
          lastLoadedPath = player.currentTrack.path;
          player.loadSubtitles(player.currentTrack.path);
        } else {
          video.addEventListener(
            'loadedmetadata',
            () => {
              if (player.currentTrack && player.currentTrack.path !== lastLoadedPath) {
                lastLoadedPath = player.currentTrack.path;
                player.loadSubtitles(player.currentTrack.path);
              }
            },
            { once: true }
          );
        }
      }
    };
    tryInit();
  }
}

watch(
  () => player.currentTrack,
  (track) => {
    if (track?.type === 'video' && track.path !== lastLoadedPath) {
      lastLoadedPath = track.path;
      player.loadSubtitles(track.path);
    }
  }
);

watch(
  () => player.currentTrack,
  (track) => {
    if (!track) return;
    if (track.type !== 'video') return;

    console.log('[VIDEO] currentTrack watch →', track.name, '(' + track.type + ')');

    settings.updatePlayback({ videoFilter: 'none', playbackSpeed: 1 });
    setupVideo(track);

    if (player.pipActive && track.type === 'video') {
      const src = getTrackSrc(track);
      pip.loadTrack(src, null);
      preparePiPSubtitleData(track.path).then((subtitleData) => {
        if (player.pipActive) {
          pip.updateSubtitle(subtitleData);
        }
      });
      if (videoRef.value) videoRef.value.pause();
      player.isPlaying = false;
    } else if (track.type === 'video') {
      const src = getTrackSrc(track);
      pip.preload(src, null);
      preparePiPSubtitleData(track.path).then((subtitleData) => {
        pip.updateSubtitle(subtitleData);
      });
    }

    const title = track.metadata?.title || track.name;
    const artist = track.metadata?.artist;
    showOSD(artist ? `${artist} - ${title}` : title, 'track', 2500);
  },
  {
    flush: 'post'
  }
);

watch(
  () => player.isPlaying,
  (playing) => {
    console.log('[VIDEO] isPlaying watch →', playing ? 'PLAY' : 'PAUSE', 'hasVideoRef:', !!videoRef.value, 'isVideo:', isVideo.value);
    if (!videoRef.value || !isVideo.value) return;
    if (player.pipActive) {
      videoRef.value.pause();
      return;
    }
    if (playing) videoRef.value.play().catch(() => {});
    else videoRef.value.pause();
  }
);

watch(
  () => settings.playback.playbackSpeed,
  (speed) => {
    if (videoRef.value) videoRef.value.playbackRate = speed;
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

  settings.updatePlayback({ videoFilter: 'none', playbackSpeed: 1 });

  if (player.currentTrack.type === 'video') {
    setupVideo(player.currentTrack);

    const src = getTrackSrc(player.currentTrack);
    if (player.pipActive) {
      pip.loadTrack(src, null);
      preparePiPSubtitleData(player.currentTrack.path).then((subtitleData) => {
        if (player.pipActive) pip.updateSubtitle(subtitleData);
      });
    } else {
      pip.preload(src, null);
      preparePiPSubtitleData(player.currentTrack.path).then((subtitleData) => {
        pip.updateSubtitle(subtitleData);
      });
    }
  }

  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement;
  });
  document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  if (resumePromptTimer) clearTimeout(resumePromptTimer);
  audioEngine.disconnectVideoElement();
  if (videoRef.value) {
    videoRef.value.pause();
    videoRef.value.removeAttribute('src');
    videoRef.value.load();
  }
  destroySubtitleRenderer();
  player.clearSubtitles();
  if (controlsTimeout.value) clearTimeout(controlsTimeout.value);
  if (osdTimeout.value) clearTimeout(osdTimeout.value);
  if (clickTimer) clearTimeout(clickTimer);
  document.removeEventListener('keydown', onKeydown);
  document.body.style.cursor = 'default';
});

watch([() => player.volume, () => player.isMuted], () => {
  if (videoRef.value) videoRef.value.volume = player.isMuted ? 0 : player.volume;
});

watch(
  () => player.activeSubtitleId,
  async (trackId) => {
    if (!trackId || !player.currentTrack) {
      removeSubtitleTrack();
      return;
    }
    const track = player.subtitleTracks.find((t) => t.id === trackId);
    if (!track) return;

    if (track.source === 'embedded' && !track.content) {
      const result = await player.loadEmbeddedSubtitle(trackId, player.currentTrack.path);
      if (result) {
        track.content = result.content;
        track.format = result.format;
        track.fonts = result.fonts;
        await loadSubtitleTrack(track);
      } else {
        console.error('[Subtitles] extraction returned null');
      }
    } else {
      await loadSubtitleTrack(track);
    }
  }
);
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
      @pip="togglePiP"
      @fullscreen="toggleFullscreen"
    />

    <!-- video area -->
    <div v-if="isVideo" class="relative flex-1 flex items-center justify-center overflow-hidden">
      <video
        :ref="onVideoRef"
        class="w-full h-full object-contain cursor-pointer"
        :style="videoFilterStyle"
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

      <!-- resume prompt -->
      <div
        v-if="player.resumePrompt"
        class="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 bg-black/80 border border-white/15 rounded-2xl px-5 py-4 flex items-center gap-4 shadow-2xl shadow-black/50"
      >
        <div class="text-white text-sm">
          <div class="font-semibold">Wykryto zapisaną pozycję</div>
          <div class="text-white/60 text-xs mt-0.5">
            {{ formatDuration(player.resumePrompt.position) }} — kontynuować czy od początku?
          </div>
        </div>
        <button
          class="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition-colors"
          @click="onResumeContinue"
        >
          Kontynuuj
        </button>
        <button
          class="px-3 py-1.5 rounded-lg bg-accent-base hover:bg-accent-hover text-white text-xs font-medium transition-colors"
          @click="onResumeStart"
        >
          Od początku
        </button>
      </div>
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
