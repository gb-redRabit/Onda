import { getStore } from './ipc/cover-cache';
import type { YoutubeAuthSettings, YoutubeAuthMethod } from '../renderer/src/types/settings';
import { logger } from '../shared/logger';

export async function getAuthSettings(): Promise<YoutubeAuthSettings> {
  try {
    const store = await getStore();
    const raw = store.get('youtube') as Partial<YoutubeAuthSettings> | undefined;
    const method: YoutubeAuthMethod =
      raw?.method === 'electron' || raw?.method === 'browser' || raw?.method === 'manual'
        ? raw.method
        : 'none';
    return {
      method,
      cookiesPath: typeof raw?.cookiesPath === 'string' ? raw.cookiesPath : '',
      cookiesBrowser: typeof raw?.cookiesBrowser === 'string' ? raw.cookiesBrowser : 'chrome',
      lastLogin: typeof raw?.lastLogin === 'number' ? raw.lastLogin : null
    };
  } catch (e) {
    logger.warn('ytauth', 'getAuthSettings failed', e);
    return { method: 'none', cookiesPath: '', cookiesBrowser: 'chrome', lastLogin: null };
  }
}

export async function setAuthSettings(partial: Partial<YoutubeAuthSettings>): Promise<void> {
  try {
    const store = await getStore();
    const current = await getAuthSettings();
    store.set('youtube', { ...current, ...partial });
  } catch (e) {
    logger.warn('ytauth', 'setAuthSettings failed', e);
  }
}
