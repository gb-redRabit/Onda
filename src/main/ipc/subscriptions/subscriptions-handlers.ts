import { app, ipcMain } from 'electron';
import { join } from 'path';
import { getStore } from '../cover/cover-cache';
import {
  loadSubscriptions,
  addSubscription,
  removeSubscription,
  updateSubscription,
  appendDownloadedVideos,
  type SubscriptionInput,
  type SubscriptionPatch
} from './subscriptions-store';
import {
  checkSubscriptions,
  checkSingleChannel,
  seedSubscriptionBaseline,
  startSubscriptionChecker,
  stopSubscriptionChecker
} from './subscription-checker';
import { setDownloadCompletedHandler } from '../../downloads/download-manager';
import { broadcastToAllWindows } from '../../utils/broadcast';
import type { IpcSubscription, IpcSubscriptionCheckResult } from '../../../shared/types/ipc';

function getSubscriptionsFile(): string {
  return join(app.getPath('userData'), 'subscriptions.json');
}

function broadcastSubscriptionUpdated(sub: IpcSubscription): void {
  broadcastToAllWindows('yt:subs:updated', sub);
}

export function registerSubscriptionHandlers(): void {
  // Ukończone pobrania atomowo powiększają downloadedVideoIds (most Faza 3→4) i
  // zapisują ścieżkę pliku per videoId (do późniejszej weryfikacji istnienia).
  setDownloadCompletedHandler((channelId, videoId, outputPath) => {
    const files = outputPath ? { [videoId]: outputPath } : undefined;
    void appendDownloadedVideos(getSubscriptionsFile(), channelId, [videoId], files).then(
      (updated) => {
        if (updated) broadcastSubscriptionUpdated(updated);
      }
    );
  });
  ipcMain.handle('yt:subs:list', async (): Promise<IpcSubscription[]> =>
    loadSubscriptions(getSubscriptionsFile())
  );
  ipcMain.handle(
    'yt:subs:add',
    async (_event, input: SubscriptionInput): Promise<IpcSubscription | null> => {
      const file = getSubscriptionsFile();
      const existing = await loadSubscriptions(file);
      const isNew = !existing.some((s) => s.channelId === input.channelId);
      const sub = await addSubscription(file, input);
      if (sub && isNew && input.seedBaseline !== false)
        void seedSubscriptionBaseline(file, sub.channelId);
      return sub;
    }
  );
  ipcMain.handle('yt:subs:remove', async (_event, channelId: string): Promise<boolean> =>
    removeSubscription(getSubscriptionsFile(), channelId)
  );
  ipcMain.handle(
    'yt:subs:update',
    async (_event, channelId: string, patch: SubscriptionPatch): Promise<IpcSubscription | null> =>
      updateSubscription(getSubscriptionsFile(), channelId, patch)
  );
  // Ręczne sprawdzenie (przycisk) dodatkowo weryfikuje pliki na dysku i odznacza braki.
  ipcMain.handle('yt:subs:checkNow', async (): Promise<IpcSubscriptionCheckResult> =>
    checkSubscriptions(getSubscriptionsFile(), undefined, true)
  );
  ipcMain.handle(
    'yt:subs:checkChannel',
    async (_event, channelId: string): Promise<IpcSubscriptionCheckResult> =>
      checkSingleChannel(getSubscriptionsFile(), channelId)
  );
}

async function isAutoDownloadEnabled(): Promise<boolean> {
  try {
    const store = await getStore();
    const download = store.get('download') as { autoDownloadSubscriptions?: boolean } | undefined;
    return !!download?.autoDownloadSubscriptions;
  } catch {
    return false;
  }
}

export async function syncSubscriptionsScheduler(): Promise<void> {
  if (await isAutoDownloadEnabled()) {
    startSubscriptionChecker(getSubscriptionsFile());
  } else {
    stopSubscriptionChecker();
  }
}
