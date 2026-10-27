import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Siatka regresyjna dla handlerów IPC subskrypcji (`yt:subs:*`) oraz mostu
// Faza 3→4 (ukończone pobranie → appendDownloadedVideos + broadcast).
// electron/checker/kolejka są mockowane; store subskrypcji działa na pliku tymczasowym.

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  userData: '',
  ipcMain: {
    handle: (ch: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      h.handlers.set(ch, fn);
    }
  }
}));

vi.mock('electron', () => ({
  ipcMain: h.ipcMain,
  app: { getPath: (name: string) => (name === 'userData' ? h.userData : '') }
}));

vi.mock('../subscriptions/subscription-checker', () => ({
  seedSubscriptionBaseline: vi.fn(async () => {}),
  checkSubscriptions: vi.fn(async () => ({ checked: 1, newVideos: 0, queued: 0, errors: 0 })),
  checkSingleChannel: vi.fn(async () => ({ checked: 1, newVideos: 0, queued: 0, errors: 0 })),
  startSubscriptionChecker: vi.fn(),
  stopSubscriptionChecker: vi.fn()
}));

vi.mock('../../downloads/download-manager', () => ({
  setDownloadCompletedHandler: vi.fn()
}));

vi.mock('../../utils/broadcast', () => ({ broadcastToAllWindows: vi.fn() }));
vi.mock('../cover/cover-cache', () => ({
  getStore: vi.fn(async () => ({ get: () => undefined }))
}));

import {
  seedSubscriptionBaseline,
  checkSubscriptions,
  checkSingleChannel
} from '../subscriptions/subscription-checker';
import { setDownloadCompletedHandler } from '../../downloads/download-manager';
import { broadcastToAllWindows } from '../../utils/broadcast';
import { registerSubscriptionHandlers } from '../subscriptions/subscriptions-handlers';
import { loadSubscriptions, addSubscription } from '../subscriptions/subscriptions-store';

let dir: string;
let file: string;

registerSubscriptionHandlers();
// Zarejestrowany callback mostu pobranie→subskrypcja (przechwycony raz, bo
// beforeEach czyści zapisane wywołania mocków).
const downloadCompletedCb = vi.mocked(setDownloadCompletedHandler).mock.calls.at(-1)?.[0];
const call = (channel: string, ...args: unknown[]): unknown => {
  const fn = h.handlers.get(channel);
  if (!fn) throw new Error(`handler not registered: ${channel}`);
  return fn({}, ...args);
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-subs-handlers-'));
  file = join(dir, 'subscriptions.json');
  h.userData = dir;
  vi.clearAllMocks();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// Most zapisuje asynchronicznie (fs + .then) — czekamy na efekt zamiast stałego ticku.
async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return predicate();
}

describe('yt:subs:list', () => {
  it('returns persisted subscriptions', async () => {
    await addSubscription(file, { channelId: 'UC1', channelTitle: 'A', channelThumbnail: '' });
    const res = (await call('yt:subs:list')) as Array<{ channelId: string }>;
    expect(res).toHaveLength(1);
    expect(res[0].channelId).toBe('UC1');
  });
});

describe('yt:subs:add', () => {
  it('adds a new subscription and seeds the baseline', async () => {
    const res = (await call('yt:subs:add', {
      channelId: 'UC1',
      channelTitle: 'A',
      channelThumbnail: ''
    })) as { channelId: string };
    expect(res.channelId).toBe('UC1');
    expect(seedSubscriptionBaseline).toHaveBeenCalledWith(file, 'UC1');
  });

  it('skips seeding when seedBaseline is false', async () => {
    await call('yt:subs:add', {
      channelId: 'UC1',
      channelTitle: 'A',
      channelThumbnail: '',
      seedBaseline: false
    });
    expect(seedSubscriptionBaseline).not.toHaveBeenCalled();
  });

  it('does not seed the baseline for an already-subscribed channel', async () => {
    await addSubscription(file, { channelId: 'UC1', channelTitle: 'A', channelThumbnail: '' });
    await call('yt:subs:add', { channelId: 'UC1', channelTitle: 'B', channelThumbnail: '' });
    expect(seedSubscriptionBaseline).not.toHaveBeenCalled();
  });
});

describe('yt:subs:remove and yt:subs:update', () => {
  it('removes an existing subscription', async () => {
    await addSubscription(file, { channelId: 'UC1', channelTitle: 'A', channelThumbnail: '' });
    expect(await call('yt:subs:remove', 'UC1')).toBe(true);
    expect(await call('yt:subs:remove', 'UC1')).toBe(false);
  });

  it('applies a patch and returns the updated subscription', async () => {
    await addSubscription(file, { channelId: 'UC1', channelTitle: 'A', channelThumbnail: '' });
    const res = (await call('yt:subs:update', 'UC1', { autoDownload: false })) as {
      autoDownload: boolean;
    };
    expect(res.autoDownload).toBe(false);
  });
});

describe('yt:subs:checkNow and yt:subs:checkChannel', () => {
  it('delegates to the full checker (with file reconcile)', async () => {
    const res = (await call('yt:subs:checkNow')) as { checked: number };
    expect(checkSubscriptions).toHaveBeenCalledWith(file, undefined, true);
    expect(res.checked).toBe(1);
  });

  it('delegates to the single-channel checker', async () => {
    await call('yt:subs:checkChannel', 'UC9');
    expect(checkSingleChannel).toHaveBeenCalledWith(file, 'UC9');
  });
});

describe('download-completed bridge', () => {
  it('appends downloaded ids and broadcasts yt:subs:updated', async () => {
    await addSubscription(file, { channelId: 'UC1', channelTitle: 'A', channelThumbnail: '' });
    expect(downloadCompletedCb).toBeTypeOf('function');
    downloadCompletedCb!('UC1', 'vid-1');
    await waitFor(() => vi.mocked(broadcastToAllWindows).mock.calls.length > 0);
    const list = await loadSubscriptions(file);
    expect(list[0].downloadedVideoIds).toContain('vid-1');
    expect(broadcastToAllWindows).toHaveBeenCalledWith(
      'yt:subs:updated',
      expect.objectContaining({ channelId: 'UC1' })
    );
  });

  it('does nothing for an unknown channel', async () => {
    downloadCompletedCb!('missing', 'vid-1');
    await new Promise((r) => setTimeout(r, 50));
    expect(broadcastToAllWindows).not.toHaveBeenCalled();
  });
});
