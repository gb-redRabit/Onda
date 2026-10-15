import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadRemoteSubscriptions,
  addRemoteSubscription,
  removeRemoteSubscription,
  updateRemoteSubscription
} from '../remote-subs-store';

// Siatka regresyjna trwałego magazynu subskrypcji linków (JSON).

let dir: string;
let file: string;
const REF = { provider: 'pikpak', shareId: 'SHARE1' };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-remote-subs-'));
  file = join(dir, 'remote-subscriptions.json');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('remote-subs-store', () => {
  it('returns an empty list for a missing file', async () => {
    await expect(loadRemoteSubscriptions(file)).resolves.toEqual([]);
  });

  it('adds a subscription with defaults', async () => {
    const sub = await addRemoteSubscription(
      file,
      { url: 'https://mypikpak.com/s/SHARE1', title: 'PikPak' },
      'pikpak',
      REF
    );
    expect(sub).toMatchObject({ providerId: 'pikpak', ref: REF, status: 'ok' });
    expect(sub!.downloadedItemIds).toEqual([]);
    expect(await loadRemoteSubscriptions(file)).toHaveLength(1);
  });

  it('is idempotent for the same provider + shareId', async () => {
    const first = await addRemoteSubscription(file, { url: 'u1' }, 'pikpak', REF);
    const second = await addRemoteSubscription(file, { url: 'u2' }, 'pikpak', REF);
    expect(second!.id).toBe(first!.id);
    expect(second!.url).toBe('u1');
    expect(await loadRemoteSubscriptions(file)).toHaveLength(1);
  });

  it('rejects an invalid input', async () => {
    await expect(addRemoteSubscription(file, { url: '' }, 'pikpak', REF)).resolves.toBeNull();
    await expect(
      addRemoteSubscription(file, { url: 'u' }, 'pikpak', null as never)
    ).resolves.toBeNull();
  });

  it('removes a subscription', async () => {
    const sub = await addRemoteSubscription(file, { url: 'u' }, 'pikpak', REF);
    expect(await removeRemoteSubscription(file, sub!.id)).toBe(true);
    expect(await removeRemoteSubscription(file, sub!.id)).toBe(false);
    expect(await loadRemoteSubscriptions(file)).toEqual([]);
  });

  it('patches status and appends downloaded ids without duplicates', async () => {
    const sub = await addRemoteSubscription(file, { url: 'u' }, 'pikpak', REF);
    const updated = await updateRemoteSubscription(file, sub!.id, {
      status: 'expired',
      lastCheckedAt: 42,
      downloadedItemIds: ['a', 'b', 'a']
    });
    expect(updated).toMatchObject({ status: 'expired', lastCheckedAt: 42 });
    expect(updated!.downloadedItemIds).toEqual(['a', 'b']);
    const again = await updateRemoteSubscription(file, sub!.id, { downloadedItemIds: ['b', 'c'] });
    expect(again!.downloadedItemIds).toEqual(['a', 'b', 'c']);
  });

  it('returns null when updating an unknown id', async () => {
    await expect(updateRemoteSubscription(file, 'nope', { status: 'ok' })).resolves.toBeNull();
  });

  it('replaces the url and ref on patch', async () => {
    const sub = await addRemoteSubscription(file, { url: 'old' }, 'pikpak', REF);
    const updated = await updateRemoteSubscription(file, sub!.id, {
      url: 'https://mypikpak.com/s/NEW',
      ref: { provider: 'pikpak', shareId: 'NEW' },
      status: 'ok'
    });
    expect(updated).toMatchObject({ url: 'https://mypikpak.com/s/NEW', status: 'ok' });
    expect(updated!.ref).toEqual({ provider: 'pikpak', shareId: 'NEW' });
  });
});
