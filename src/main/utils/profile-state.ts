import { rm } from 'fs/promises';
import { join } from 'path';
import { logger } from '../../shared/logger';

// Profile state wiped by the factory reset (IPC `app:factoryReset`). Keep in
// sync with `docs/state.md` §3 — `bin/` (managed ffmpeg/yt-dlp) and
// `onda-store-key` (per-install encryption key) are intentionally NOT listed.

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

// User-installed plugins and their storage/settings.
export const RESET_STATE_DIRS = ['plugins', 'plugins-data'];

/**
 * Removes the profile state files/directories plus any extra files the caller
 * passes (e.g. `config.json.bak.*`). Best-effort: locked entries are returned
 * so the caller can log/report them; missing entries are not an error.
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
