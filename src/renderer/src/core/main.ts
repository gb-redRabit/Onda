import { createPinia, setActivePinia } from 'pinia';
import { useSettingsStore } from '@renderer/stores/settings';
import { usePlayerStore } from '@renderer/stores/player';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { ensureMediaServerUrl } from '@renderer/utils/mediaUrl';
import { toPlainTrack } from '@shared/core-state';
import type { CoreCommand, CoreStateDto } from '@shared/types/ipc/channels-core';
import type { MediaFile } from '@shared/types/media';

// Spike Fazy 1: ukryty renderer bez UI. Ma tylko jedno zadanie — być jedynym
// właścicielem audio. Shell dostaje stan przez `core:state`, a komendy przez
// `core:command`. Docelowo (Faza 2) dojdą tu kolejka, historia, EQ i sesja.

const STATE_INTERVAL_MS = 250;

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

async function boot(): Promise<void> {
  const api = window.api;
  if (!api) throw new Error('preload API unavailable in Core');

  // Bez tego `toMediaServerUrl` buduje `/?path=...` (bez tokenu), a <audio> cicho
  // nie ładuje pliku. Główne okno robi to w bootstrapie przed montowaniem.
  await ensureMediaServerUrl();

  const settings = useSettingsStore();
  await settings.load();
  const player = usePlayerStore();
  player.setVolume(settings.playback.defaultVolume);
  const audio = useAudioPlayer();

  let revision = 0;
  let lastError: string | null = null;

  function sendState(): void {
    const state: CoreStateDto = {
      revision: ++revision,
      current: toPlainTrack(player.currentTrack),
      isPlaying: player.isPlaying,
      enginePlaying: audio.isPlaying.value,
      currentTime: audio.currentTime.value,
      duration: audio.duration.value,
      volume: player.volume,
      isMuted: player.isMuted,
      isLoading: audio.isLoading.value,
      error: lastError ?? audio.error.value
    };
    api.send('core:state', state);
  }

  function handleCommand(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const command = raw as CoreCommand;
    console.info('core-spike', `command received: ${command.type}`);
    switch (command.type) {
      case 'load': {
        if (!command.track || typeof command.track.path !== 'string') return;
        const track = command.track as MediaFile;
        if (track.type === 'video' || track.type === 'image') {
          throw new Error(`Core spike supports audio only (got ${track.type})`);
        }
        player.setTrack(track);
        if (command.autoplay !== false) player.play();
        break;
      }
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
      case 'next':
        player.nextTrack();
        break;
      case 'prev':
        player.prevTrack();
        break;
      default:
        break;
    }
  }

  setInterval(() => {
    if (revision % 8 === 0) console.info('core-spike', `tick rev=${revision}`);
    sendState();
  }, STATE_INTERVAL_MS);
  sendState();

  api.on('core:command', (raw) => {
    try {
      handleCommand(raw);
      lastError = null;
    } catch (error) {
      lastError = errorMessage(error);
      api.send('core:error', lastError);
      sendState();
    }
  });

  api.send('core:ready', true);
}

void boot().catch((error) => {
  window.api?.send('core:error', errorMessage(error));
});
