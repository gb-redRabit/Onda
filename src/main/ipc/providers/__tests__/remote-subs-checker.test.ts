import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Siatka regresyjna okresowego sprawdzania subskrypcji LINKÓW: status + wykrywanie
// nowych pozycji (baza z pierwszego sprawdzenia). `listProviderFolder` mockowany.

vi.mock('../registry', () => ({ listProviderFolder: vi.fn() }));

import { listProviderFolder } from '../registry';
import { checkRemoteSubscriptions } from '../remote-subs-checker';
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
});
