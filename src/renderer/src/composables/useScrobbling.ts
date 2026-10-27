import { watch } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { isCoreShell } from '@renderer/utils/runtimeMode';
import { logger } from '@shared/logger';
import type { ScrobbleTrack } from '@shared/types/ipc/channels-scrobbling';
import { currentTime, duration, isPlaying } from './useAudioPlayer';
import { shouldScrobble, toScrobbleTrack } from '@renderer/utils/scrobbler';

const LASTFM_SESSION_ID = 'scrobble:lastfm-session';
const LISTENBRAINZ_TOKEN_ID = 'scrobble:listenbrainz-token';

function enabledInSettings(apiKeys: { id: string; isActive?: boolean }[]): boolean {
  return apiKeys.some(
    (key) =>
      (key.id === LASTFM_SESSION_ID || key.id === LISTENBRAINZ_TOKEN_ID) && key.isActive === true
  );
}

function send(
  channel: 'scrobbling:nowPlaying' | 'scrobbling:scrobble',
  track: ScrobbleTrack
): void {
  const pending = window.api?.invoke(channel, track);
  void pending?.catch((e) => {
    logger.warn('scrobbling', `${channel} failed`, e);
  });
}

/**
 * Wysyła „now playing” i scrobble na podstawie stanu odtwarzacza. Rejestrowane raz
 * w `App.vue`; cała logika progów żyje w `utils/scrobbler.ts` i jest testowana osobno.
 */
export function useScrobbling(): void {
  if (isCoreShell()) return;
  const player = usePlayerStore();
  const settings = useSettingsStore();

  let lastTrack: MediaFile | null = null;
  let lastElapsed = 0;
  let lastDuration = 0;
  let startedAt = 0;
  let nowPlayingSent = false;
  let scrobbled = false;

  const isEnabled = (): boolean => enabledInSettings(settings.apiKeys.keys);

  function payload(track: MediaFile): ScrobbleTrack | null {
    if (track.type !== 'audio' || track.id.startsWith('radio:')) return null;
    // Gdy użytkownik naładował utwór, ale długo czekał z play, timestamp liczymy
    // od faktycznego startu (albo od początku odtwarzania, jeśli go nie znamy).
    const start =
      startedAt || Math.max(0, Math.floor(Date.now() / 1000 - Math.max(0, lastElapsed)));
    return toScrobbleTrack(track, lastDuration || track.duration || 0, start);
  }

  function finishPrevious(): void {
    if (!lastTrack || scrobbled || !isEnabled()) return;
    if (!shouldScrobble(lastElapsed, lastDuration)) return;
    const data = payload(lastTrack);
    if (data) {
      scrobbled = true;
      send('scrobbling:scrobble', data);
    }
  }

  function maybeNowPlaying(track: MediaFile | null): void {
    if (!track || nowPlayingSent || !isPlaying.value || !isEnabled()) return;
    if (!startedAt) startedAt = Math.floor(Date.now() / 1000);
    const data = payload(track);
    if (!data) return;
    nowPlayingSent = true;
    send('scrobbling:nowPlaying', data);
  }

  watch(
    () => player.currentTrack?.path ?? null,
    () => {
      finishPrevious();
      lastTrack = player.currentTrack;
      lastElapsed = 0;
      startedAt = 0;
      lastDuration = lastTrack?.duration || 0;
      nowPlayingSent = false;
      scrobbled = false;
      maybeNowPlaying(lastTrack);
    }
  );

  watch(isPlaying, (playing) => {
    if (playing) maybeNowPlaying(player.currentTrack);
  });

  watch(duration, (value) => {
    if (player.currentTrack?.type === 'audio' && value > 0) lastDuration = value;
  });

  watch(currentTime, (value) => {
    if (player.currentTrack?.type !== 'audio' || !isPlaying.value) return;
    // Repeat-one / ponowne od początku nie zmienia ścieżki — wyzeruj stan sesji.
    if (value + 5 < lastElapsed && value < 5) {
      scrobbled = false;
      nowPlayingSent = false;
      startedAt = 0;
    }
    lastElapsed = value;
    maybeNowPlaying(player.currentTrack);
    if (!scrobbled && shouldScrobble(value, lastDuration)) {
      const data = payload(player.currentTrack);
      if (data) {
        scrobbled = true;
        send('scrobbling:scrobble', data);
      }
    }
  });

  // Ostatni utwór przed zamknięciem okna: best-effort.
  window.addEventListener('beforeunload', finishPrevious, { once: true });
}
