import { onBeforeUnmount, onMounted, watch } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { splitTitle } from '@shared/discord-title';
import type { PresenceState } from '@shared/types/discord';

const PUSH_INTERVAL_MS = 10_000;

/**
 * Wysyła stan odtwarzacza do procesu głównego (Discord Rich Presence). Renderer jest
 * źródłem prawdy — main tylko mapuje i wysyła do lokalnego klienta Discorda.
 */
export function useDiscordPresence(): void {
  const settings = useSettingsStore();
  const player = usePlayerStore();
  let interval: ReturnType<typeof setInterval> | null = null;

  function configure(): void {
    void window.api?.configureDiscord({
      enabled: settings.general.discordRichPresence,
      clientId: settings.general.discordClientId
    });
  }

  function push(): void {
    if (!settings.general.discordRichPresence) return;
    const track = player.currentTrack;
    if (!track) {
      window.api?.updateDiscordPresence(null);
      return;
    }
    const rawTitle = track.metadata?.title || track.name;
    const split = splitTitle(rawTitle, track.metadata?.artist);
    const state: PresenceState = {
      title: split.title,
      kind: track.type === 'video' ? 'video' : track.type === 'stream' ? 'stream' : 'audio',
      isPlaying: player.isPlaying,
      positionSec: player.currentTime
    };
    if (split.artist) state.artist = split.artist;
    if (track.metadata?.album) state.album = track.metadata.album;
    if (track.thumbnail && /^https?:\/\//i.test(track.thumbnail)) {
      state.coverUrl = track.thumbnail;
    }
    if (track.type !== 'stream') {
      const duration = player.duration || track.duration || 0;
      if (duration > 0) state.durationSec = duration;
    }
    window.api?.updateDiscordPresence(state);
  }

  function syncInterval(): void {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    if (settings.general.discordRichPresence) interval = setInterval(push, PUSH_INTERVAL_MS);
  }

  function sync(): void {
    configure();
    push();
    syncInterval();
  }

  onMounted(sync);

  watch(
    () => [player.currentTrack?.path, player.isPlaying],
    () => push()
  );

  watch(
    () => [settings.general.discordRichPresence, settings.general.discordClientId],
    () => sync()
  );

  onBeforeUnmount(() => {
    if (interval) clearInterval(interval);
    window.api?.updateDiscordPresence(null);
  });
}
