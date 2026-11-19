import { createPinia, setActivePinia } from 'pinia';
import { computed, watch } from 'vue';
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
  let lastTickKey = '';
  let structureDirty = true;
  let vizTimer: ReturnType<typeof setInterval> | null = null;
  let vizRaw: Uint8Array<ArrayBuffer> | null = null;
  const vizBins: number[] = new Array<number>(256).fill(0);

  function setVizActive(active: boolean): void {
    if (active && !vizTimer) {
      vizTimer = setInterval(() => {
        if (!audio.isPlaying.value) return;
        const analyser = audio.getAnalyserNode();
        if (!analyser) return;
        const count = 256;
        if (!vizRaw || vizRaw.length !== analyser.frequencyBinCount) {
          vizRaw = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(vizRaw);
        const step = Math.max(1, Math.floor(vizRaw.length / count));
        for (let i = 0; i < count; i += 1) {
          let sum = 0;
          const start = i * step;
          const end = Math.min(start + step, vizRaw.length);
          for (let j = start; j < end; j += 1) sum += vizRaw[j];
          vizBins[i] = Math.round(sum / Math.max(1, end - start));
        }
        // Reużycie buforów: wcześniej 30 razy/s powstawały nowa tablica i 256
        // elementów tylko po to, by IPC skopiowało je i wyrzuciło.
        api.send('core:viz', vizBins);
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
    const next = tick();
    // Tick leci 4×/s; w bezczynności (pauza) wszystkie pola są identyczne.
    // Odrzucamy duplikaty, żeby nie budzić shella i nie serializować IPC bez powodu.
    const key = [
      next.currentTime,
      next.duration,
      next.buffered,
      next.isPlaying ? 1 : 0,
      next.enginePlaying ? 1 : 0,
      next.isLoading ? 1 : 0,
      next.error ?? ''
    ].join('|');
    if (key === lastTickKey) return;
    lastTickKey = key;
    api.send('core:tick', next);
  }

  function pushState(): void {
    // Zmianę struktury wykrywa watch poniżej (raz na realną zmianę), zamiast
    // mapować całą kolejkę i historię 4×/s w pętli.
    if (structureDirty) {
      structureDirty = false;
      sendFull();
      return;
    }
    sendTick();
  }

  const structureSignature = computed(() => structuralKey());
  watch(
    structureSignature,
    () => {
      structureDirty = true;
    },
    { flush: 'sync' }
  );

  function handleCommand(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const command = raw as CoreCommand;
    switch (command.type) {
      case 'load': {
        if (!command.track || typeof command.track.path !== 'string') return;
        const track = command.track as MediaFile;
        if (track.type === 'image') {
          throw new Error(`Core supports audio/video only (got ${track.type})`);
        }
        // Wideo: Core zatrzymuje audio i tylko parkuje bieżący utwór/kolejkę.
        // Obraz odtwarza main shell; Core dostaje `next`, gdy wideo się skończy.
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
    structureDirty = false;
    sendFull();
  }

  setInterval(pushState, TICK_INTERVAL_MS);
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
