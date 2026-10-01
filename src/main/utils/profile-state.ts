import { rm } from 'fs/promises';
import { join } from 'path';
import { logger } from '../../shared/logger';

// Stan profilu czyszczony przez reset fabryczny (IPC `app:factoryReset`). Utrzymuj
// w zgodzie z `docs/state.md` §3 — `bin/` (zarządzane ffmpeg/yt-dlp) i
// `onda-store-key` (klucz szyfrowania na instalację) celowo NIE są wymienione.

export const RESET_STATE_FILES = [
  'library-scanned.json',
  'downloads-queue.json',
  'download-profiles.json',
  'radios.json',
  'saved-streams.json',
  'sources.json',
  'subscriptions.json',
  'plugins-state.json',
  'cover-cache-map.json',
  'stream-url-cache.json',
  'youtube-cookies.txt'
];

// Wtyczki zainstalowane przez użytkownika oraz ich storage/ustawienia.
export const RESET_STATE_DIRS = ['plugins', 'plugins-data'];

/**
 * Usuwa pliki/katalogi stanu profilu oraz wszelkie dodatkowe pliki przekazane
 * przez wywołującego (np. `config.json.bak.*`). Best-effort: zablokowane wpisy
 * są zwracane, aby wywołujący mógł je zalogować/zgłosić; brakujące wpisy nie są błędem.
 */
export async function removeProfileState(
  userDataDir: string,
  extraFiles: readonly string[] = []
): Promise<string[]> {
  const targets = [...RESET_STATE_FILES, ...RESET_STATE_DIRS, ...extraFiles];
  const failed: string[] = [];
  for (const name of targets) {
    try {
      await rm(join(userDataDir, name), { recursive: true, force: true });
    } catch (e) {
      failed.push(name);
      logger.warn('reset', `factory reset could not remove ${name}`, e);
    }
  }
  return failed;
}
