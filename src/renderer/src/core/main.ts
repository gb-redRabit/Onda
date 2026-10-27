import { createPinia, setActivePinia } from 'pinia';
import { useSettingsStore } from '@renderer/stores/settings';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { useScrobbling } from '@renderer/composables/useScrobbling';
import { useDiscordPresence } from '@renderer/composables/useDiscordPresence';
import { ensureMediaServerUrl } from '@renderer/utils/mediaUrl';
import { toPlainTrack } from '@shared/core-state';
import type { CoreCommand, CoreStateDto, CoreTickDto } from '@shared/types/ipc/channels-core';
import type { MediaFile } from '@shared/types/media';

// Faza 2 (#23): ukryty Core jest właścicielem audio, kolejki, historii,
// scrobbling i Discorda. Shell dostaje pełny snapshot tylko przy zmianie
// struktury i mały tick pozycji 4×/s.

const TICK_INTERVAL_MS = 250;

const pinia = createPinia();
setActivePinia(pinia);

window.addEventListener('error', (event) => {
  window.api?.send('core:error', `window error: ${event.message}`);
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  window.api?.send('core:error', `unhandled rejection: ${reason}`);
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function plainTracks(tracks: readonly MediaFile[]): MediaFile[] {
  return tracks.map((track) => toPlainTrack(track)).filter((track): track is MediaFile => !!track);
}

async function boot(): Promise<void> {
  const api = window.api;
  if (!api) throw new Error('preload API unavailable in Core');

  await ensureMediaServerUrl();

  const settings = useSettingsStore();
  await settings.load();
  const player = usePlayerStore();
  player.setVolume(settings.playback.defaultVolume);
  const audio = useAudioPlayer();

  // Scrobbling i Discord muszą działać także wtedy, gdy żaden shell nie jest otwarty.
  useScrobbling();
  useDiscordPresence({ headless: true });

  let revision = 0;
  let lastError: string | null = null;
  let lastStructuralKey = '';
  let vizTimer: ReturnType<typeof setInterval> | null = null;

  function setVizActive(active: boolean): void {
    if (active && !vizTimer) {
      vizTimer = setInterval(() => {
        if (!audio.isPlaying.value) return;
        const analyser = audio.getAnalyserNode();
        if (!analyser) return;
        const raw = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(raw);
        const count = 256;
        const step = Math.max(1, Math.floor(raw.length / count));
        const bins: number[] = new Array<number>(count).fill(0);
        for (let i = 0; i < count; i += 1) {
          let sum = 0;
          const start = i * step;
          const end = Math.min(start + step, raw.length);
          for (let j = start; j < end; j += 1) sum += raw[j];
          bins[i] = Math.round(sum / Math.max(1, end - start));
        }
        api.send('core:viz', bins);
      }, 33);
    } else if (!active && vizTimer) {
      clearInterval(vizTimer);
      vizTimer = null;
    }
  }

  function tick(): CoreTickDto {
    return {
      revision: ++revision,
      currentTime: audio.currentTime.value,
      duration: audio.duration.value,
      buffered: audio.buffered.value,
      isPlaying: player.isPlaying,
      enginePlaying: audio.isPlaying.value,
      isLoading: audio.isLoading.value,
      error: lastError ?? audio.error.value
    };
  }

  function structuralKey(): string {
    return [
      player.currentTrack?.path ?? '',
      player.queue.map((track) => track.path).join('|'),
      player.pendingQueue.map((track) => track.path).join('|'),
      player.history.map((track) => track.path).join('|'),
      player.volume,
      player.isMuted,
      player.shuffle,
      player.repeat,
      player.pipActive,
      player.pipTime
    ].join('::');
  }

  function sendFull(): void {
    const state: CoreStateDto = {
      ...tick(),
      current: toPlainTrack(player.currentTrack),
      queue: plainTracks(player.queue),
      pendingQueue: plainTracks(player.pendingQueue),
      history: plainTracks(player.history),
      volume: player.volume,
      isMuted: player.isMuted,
      shuffle: player.shuffle,
      repeat: player.repeat,
      pipActive: player.pipActive,
      pipTime: player.pipTime
    };
    api.send('core:state', state);
  }

  function sendTick(): void {
    api.send('core:tick', tick());
  }

  function pushState(): void {
    const key = structuralKey();
    if (key !== lastStructuralKey) {
      lastStructuralKey = key;
      sendFull();
    } else {
      sendTick();
    }
  }

  function handleCommand(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const command = raw as CoreCommand;
    switch (command.type) {
      case 'load': {
        if (!command.track || typeof command.track.path !== 'string') return;
        const track = command.track as MediaFile;
        if (track.type === 'video' || track.type === 'image') {
          throw new Error(`Core supports audio only (got ${track.type})`);
        }
        if (command.queue) player.queue = command.queue;
        if (command.pendingQueue) player.pendingQueue = command.pendingQueue;
        player.setTrack(track, { resume: command.resume === true });
        if (command.autoplay !== false) player.play();
        break;
      }
      case 'setQueue':
        player.queue = command.queue;
        player.pendingQueue = command.pendingQueue ?? [];
        break;
      case 'play':
        player.play();
        break;
      case 'pause':
        player.pause();
        break;
      case 'toggle':
        player.togglePlay();
        break;
      case 'seek': {
        const time = Math.max(0, Number(command.time) || 0);
        player.seek(time);
        audio.seek(time);
        break;
      }
      case 'setVolume': {
        const value = Math.max(0, Math.min(1, Number(command.value) || 0));
        audio.setVolume(value);
        break;
      }
      case 'toggleMute':
        player.toggleMute();
        break;
      case 'toggleShuffle':
        player.toggleShuffle();
        break;
      case 'cycleRepeat':
        player.cycleRepeat();
        break;
      case 'next':
        player.nextTrack();
        break;
      case 'prev':
        player.prevTrack();
        break;
      case 'playFromHistory':
        player.playFromHistory(Number(command.index) || 0);
        break;
      case 'clear':
        player.clearTrack();
        break;
      case 'setPip':
        player.pipActive = command.active === true;
        player.pipTime = Number(command.time) || player.currentTime;
        break;
      case 'viz':
        setVizActive(command.active === true);
        break;
      case 'eqBands':
        audio.applyEqBands(command.bands);
        break;
      case 'eqEnabled':
        audio.setEqEnabled(command.enabled === true);
        break;
      case 'eqPreamp':
        audio.setEqPreamp(Number(command.db) || 0);
        break;
      case 'eqMono':
        audio.setEqMono(command.on === true);
        break;
      case 'nightMode':
        audio.setNightMode(command.on === true);
        break;
      case 'audioDelay':
        audio.setAudioDelay(Number(command.ms) || 0);
        break;
      case 'applyEqGraph':
        audio.applyEqGraph(command.bands);
        break;
      default:
        break;
    }
    // Natychmiast po komendzie wyślij stan — nie czekaj do ticku.
    lastStructuralKey = structuralKey();
    sendFull();
  }

  setInterval(pushState, TICK_INTERVAL_MS);
  lastStructuralKey = structuralKey();
  sendFull();

  api.on('core:command', (raw) => {
    try {
      handleCommand(raw);
      lastError = null;
    } catch (error) {
      lastError = errorMessage(error);
      api.send('core:error', lastError);
      sendTick();
    }
  });

  api.send('core:ready', true);
}

void boot().catch((error) => {
  window.api?.send('core:error', errorMessage(error));
});
