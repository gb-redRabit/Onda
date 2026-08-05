import { getStore } from './ipc/cover-cache';
import { checkForUpdates, getUpdaterState } from './updater';
import { logger } from '../shared/logger';

type UpdateInterval = 'startup' | 'hourly' | 'daily' | 'weekly';

const INTERVAL_MS: Record<Exclude<UpdateInterval, 'startup'>, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000
};

const STARTUP_DELAY_MS = 5000;

let timer: ReturnType<typeof setInterval> | null = null;
let checking = false;

export async function configureAutoCheck(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (!getUpdaterState().enabled) return;

  try {
    const store = await getStore();
    const updates = (store.get('updates') || {}) as {
      autoCheck?: boolean;
      checkInterval?: UpdateInterval;
    };
    if (!updates.autoCheck) return;

    const interval = updates.checkInterval ?? 'startup';
    if (interval === 'startup') {
      setTimeout(() => void runCheck(), STARTUP_DELAY_MS);
      return;
    }

    setTimeout(() => void runCheck(), STARTUP_DELAY_MS);
    timer = setInterval(() => void runCheck(), INTERVAL_MS[interval]);
    timer.unref?.();
    logger.info('updater', `auto-check scheduled (${interval})`);
  } catch (e) {
    logger.warn('updater', 'configureAutoCheck failed', e);
  }
}

async function runCheck(): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    await checkForUpdates();
  } finally {
    checking = false;
  }
}
