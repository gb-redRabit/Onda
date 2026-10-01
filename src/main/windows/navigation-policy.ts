import { join } from 'path';
import { fileURLToPath } from 'url';
import { isPathInside } from '../path-security';

// Exported for tests: the directory the app's own files live in.
export const APP_PATH = join(__dirname, '..');

export interface NavigationPolicyOptions {
  // Allow data: URLs (used by the PiP preview placeholder windows).
  allowData?: boolean;
}

export function isAllowedNavigationUrl(
  url: string,
  devUrl: string | undefined,
  options: NavigationPolicyOptions = {}
): boolean {
  try {
    const parsed = new URL(url);
    if (options.allowData && parsed.protocol === 'data:') return true;
    if (parsed.protocol === 'file:') {
      // Only files shipped with the app. Media is served over http by the media
      // server and consumed as <img>/<audio>/<video> sources — never as a
      // navigation target — so nothing else may be navigated to. (Previously
      // every file: URL was allowed, which is a local-file-read primitive.)
      // `fileURLToPath` (not path.resolve on the pathname) handles Windows drive
      // letters and percent-encoding correctly.
      try {
        return isPathInside(APP_PATH, fileURLToPath(parsed));
      } catch {
        return false;
      }
    }
    if (parsed.protocol === 'onda:') return true;
    if (devUrl) {
      const dev = new URL(devUrl);
      if (parsed.origin === dev.origin) return true;
    }
    return false;
  } catch {
    return false;
  }
}
