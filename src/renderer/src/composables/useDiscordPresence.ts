import { onBeforeUnmount, onMounted, watch } from 'vue';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { isCoreShell } from '@renderer/utils/runtimeMode';
import { splitTitle } from '@shared/discord-title';
import type { MediaFile } from '@shared/types/media';
import type { DiscordCoverQuery, PresenceState } from '@shared/types/discord';

const PUSH_INTERVAL_MS = 10_000;
const MAX_COVER_CACHE = 300;

export interface DiscordPresenceOptions {
  /** Core nie jest komponentem Vue — pomijamy lifecycle i startujemy od razu. */
  headless?: boolean;
}

/**
 * Wysyła stan odtwarzacza do procesu głównego (Discord Rich Presence). Renderer jest
 * źródłem prawdy — main tylko mapuje i wysyła do lokalnego klienta Discorda.
 */
export function useDiscordPresence(options: DiscordPresenceOptions = {}): void {
  if (isCoreShell()) return;
  const settings = useSettingsStore();
  const player = usePlayerStore();
  let interval: ReturnType<typeof setInterval> | null = null;
  const coverCache = new Map<string, string | null>();
  const pendingLookups = new Map<string, Promise<string | null>>();
  const localCoverCache = new Map<string, string | null>();
  const pendingLocalCovers = new Map<string, Promise<string | null>>();

  function configure(): void {
    void window.api?.configureDiscord({
      enabled: settings.general.discordRichPresence,
      clientId: settings.general.discordClientId
    });
  }

  function rememberCover(key: string, url: string | null): void {
    coverCache.set(key, url);
    while (coverCache.size > MAX_COVER_CACHE) {
      const oldest = coverCache.keys().next();
      if (oldest.done) break;
      coverCache.delete(oldest.value);
    }
  }

  function lookupCover(key: string, query: DiscordCoverQuery): Promise<string | null> {
    const existing = pendingLookups.get(key);
    if (existing) return existing;
    const request = (window.api?.resolveDiscordCover(query) ?? Promise.resolve(null))
      .catch(() => null)
      .then((url) => {
        rememberCover(key, url);
        return url;
      })
      .finally(() => pendingLookups.delete(key));
    pendingLookups.set(key, request);
    return request;
  }

  function lookupLocalCover(key: string, filePath: string): Promise<string | null> {
    const existing = pendingLocalCovers.get(key);
    if (existing) return existing;
    const request = (window.api?.resolveLocalDiscordCover(filePath) ?? Promise.resolve(null))
      .catch(() => null)
      .then((url) => {
        localCoverCache.set(key, url);
        return url;
      })
      .finally(() => pendingLocalCovers.delete(key));
    pendingLocalCovers.set(key, request);
    return request;
  }

  /**
   * Discord pobiera okładkę z zewnątrz, więc obraz z pliku lokalnego musi zostać
   * opublikowany. Najpierw (opcjonalnie) wysyłamy samą okładkę na publiczny
   * hosting, potem szukamy publicznej okładki w katalogu iTunes.
   */
  async function applyCover(track: MediaFile, state: PresenceState): Promise<void> {
    if (!player.isPlaying) return;
    if (state.coverUrl || !settings.general.discordRichPresence) return;
    if (track.type === 'stream' || track.type === 'image') return;

    if (settings.general.discordUploadLocalCovers) {
      const key = `${track.path}|${track.mtime ?? ''}`;
      const cachedLocal = localCoverCache.get(key);
      const localUrl =
        cachedLocal !== undefined ? cachedLocal : await lookupLocalCover(key, track.path);
      // Brak okładki w pliku lub nieudany upload → próbujemy katalogu iTunes niżej.
      if (localUrl) {
        if (player.currentTrack?.path !== track.path || !player.isPlaying) return;
        window.api?.updateDiscordPresence({ ...state, coverUrl: localUrl });
        return;
      }
    }

    if (!settings.general.discordOnlineCovers) return;
    if (!state.artist || !state.title) return;

    const key = [state.artist, state.album ?? '', state.title].join('|').toLowerCase();
    const cached = coverCache.get(key);
    if (cached !== undefined) {
      if (cached) window.api?.updateDiscordPresence({ ...state, coverUrl: cached });
      return;
    }

    const url = await lookupCover(key, {
      artist: state.artist,
      title: state.title,
      ...(state.album ? { album: state.album } : {})
    });
    if (!url) return;
    if (player.currentTrack?.path !== track.path) return;
    if (!settings.general.discordRichPresence || !player.isPlaying) return;
    window.api?.updateDiscordPresence({ ...state, coverUrl: url });
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
    void applyCover(track, state);
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

  if (options.headless) sync();
  else onMounted(sync);

  watch(
    () => [player.currentTrack?.path, player.isPlaying],
    () => push()
  );

  watch(
    () => [settings.general.discordRichPresence, settings.general.discordClientId],
    () => sync()
  );

  watch(
    () => [settings.general.discordUploadLocalCovers, settings.general.discordOnlineCovers],
    () => push()
  );

  if (!options.headless) {
    onBeforeUnmount(() => {
      if (interval) clearInterval(interval);
      window.api?.updateDiscordPresence(null);
    });
  }
}
