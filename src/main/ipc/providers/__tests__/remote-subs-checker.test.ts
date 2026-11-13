import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Siatka regresyjna okresowego sprawdzania subskrypcji LINKÓW: status + wykrywanie
// nowych pozycji (baza z pierwszego sprawdzenia). `listProviderFolder` mockowany.

vi.mock('../registry', () => ({ listProviderFolder: vi.fn() }));

import { listProviderFolder } from '../registry';
import {
  checkRemoteSubscriptions,
  looksExpired,
  startLinkSubsChecker,
  stopLinkSubsChecker
} from '../remote-subs-checker';
import { addRemoteSubscription, loadRemoteSubscriptions } from '../remote-subs-store';

const listMock = vi.mocked(listProviderFolder);
let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-linksubs-check-'));
  file = join(dir, 'remote-subscriptions.json');
  listMock.mockReset();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const item = (id: string) => ({ id, name: `${id}.mp4`, kind: 'file' as const });

describe('checkRemoteSubscriptions', () => {
  it('seeds the baseline on the first check (no "new" reported)', async () => {
    await addRemoteSubscription(file, { url: 'u' }, 'pikpak', {
      provider: 'pikpak',
      shareId: 'S1'
    });
    listMock.mockResolvedValueOnce([item('a'), item('b')]);
    const res = await checkRemoteSubscriptions(file);
    expect(res).toMatchObject({ checked: 1, newItems: 0, errors: 0 });
    // Musi omijać trwały cache folderów, inaczej nowe pozycje nigdy nie zostaną wykryte.
    expect(listMock).toHaveBeenCalledWith({ provider: 'pikpak', shareId: 'S1' }, undefined, true);
    const sub = (await loadRemoteSubscriptions(file))[0];
    expect(sub.status).toBe('ok');
    expect(sub.seenItemIds).toEqual(['a', 'b']);
    expect(sub.newCount).toBe(0);
  });

  it('reports newly appeared items on the next check', async () => {
    await addRemoteSubscription(file, { url: 'u' }, 'pikpak', {
      provider: 'pikpak',
      shareId: 'S1'
    });
    listMock.mockResolvedValueOnce([item('a'), item('b')]);
    await checkRemoteSubscriptions(file);
    listMock.mockResolvedValueOnce([item('c'), item('a'), item('b')]);
    const res = await checkRemoteSubscriptions(file);
    expect(res.newItems).toBe(1);
    const sub = (await loadRemoteSubscriptions(file))[0];
    expect(sub.newCount).toBe(1);
    expect(sub.seenItemIds).toEqual(['c', 'a', 'b']);
  });

  it('marks the subscription expired when listing fails like an expiry', async () => {
    await addRemoteSubscription(file, { url: 'u' }, 'pikpak', {
      provider: 'pikpak',
      shareId: 'S1'
    });
    listMock.mockRejectedValueOnce(new Error('share_status=PROHIBITED'));
    const res = await checkRemoteSubscriptions(file);
    expect(res.errors).toBe(1);
    expect((await loadRemoteSubscriptions(file))[0].status).toBe('expired');
  });

  it('marks other failures as errors and stringifies non-Error throws', async () => {
    await addRemoteSubscription(file, { url: 'u' }, 'pikpak', {
      provider: 'pikpak',
      shareId: 'S1'
    });
    listMock.mockRejectedValueOnce('network down');
    const res = await checkRemoteSubscriptions(file);

    expect(res.errors).toBe(1);
    expect((await loadRemoteSubscriptions(file))[0].status).toBe('error');
  });

  it('skips a concurrent run instead of double-checking', async () => {
    await addRemoteSubscription(file, { url: 'u' }, 'pikpak', {
      provider: 'pikpak',
      shareId: 'S1'
    });
    let release!: (items: unknown) => void;
    listMock.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)) as never);

    const first = checkRemoteSubscriptions(file);
    const second = await checkRemoteSubscriptions(file);
    expect(second).toEqual({ checked: 0, newItems: 0, errors: 0 });

    await new Promise((r) => setTimeout(r, 20));
    release([item('a')]);
    await expect(first).resolves.toMatchObject({ checked: 1 });
  });
});

describe('looksExpired', () => {
  it('recognizes expiry, password and missing-share messages', () => {
    for (const message of [
      'link expired',
      'wygasł link',
      'pass_code required',
      'hasło wymagane',
      'PROHIBITED share',
      'folder not found',
      'nie znaleziono',
      'HTTP 404'
    ]) {
      expect(looksExpired(message)).toBe(true);
    }
    expect(looksExpired('temporary network failure')).toBe(false);
  });
});

describe('checker scheduling', () => {
  afterEach(() => {
    stopLinkSubsChecker();
  });

  async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (predicate()) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('condition not met in time');
  }

  it('runs immediately and then on the configured interval, and stops cleanly', async () => {
    await addRemoteSubscription(file, { url: 'u' }, 'pikpak', {
      provider: 'pikpak',
      shareId: 'S1'
    });
    listMock.mockResolvedValue([item('a')]);

    startLinkSubsChecker(file, 30);
    await waitFor(() => listMock.mock.calls.length >= 1);
    await waitFor(() => listMock.mock.calls.length >= 2);

    stopLinkSubsChecker();
    const count = listMock.mock.calls.length;
    await new Promise((r) => setTimeout(r, 100));
    expect(listMock.mock.calls.length).toBe(count);
    // Second stop is a no-op.
    expect(() => stopLinkSubsChecker()).not.toThrow();
  });

  it('replaces an existing interval when started again', async () => {
    await addRemoteSubscription(file, { url: 'u' }, 'pikpak', {
      provider: 'pikpak',
      shareId: 'S1'
    });
    listMock.mockResolvedValue([]);

    startLinkSubsChecker(file, 40);
    startLinkSubsChecker(file, 40);
    await waitFor(() => listMock.mock.calls.length >= 1);

    stopLinkSubsChecker();
  });
});
