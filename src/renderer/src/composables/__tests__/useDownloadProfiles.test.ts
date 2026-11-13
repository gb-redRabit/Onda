import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  invoke: vi.fn()
}));

const api = window as unknown as { api: { invoke: typeof h.invoke } };

type ProfilesApi = typeof import('../useDownloadProfiles').useDownloadProfiles;

let useDownloadProfiles: ProfilesApi;

beforeEach(async () => {
  h.invoke.mockReset().mockResolvedValue([]);
  api.api = { invoke: h.invoke };
  vi.resetModules();
  ({ useDownloadProfiles } = await import('../useDownloadProfiles'));
});

describe('useDownloadProfiles', () => {
  it('loads profiles once through ensureLoaded', async () => {
    h.invoke.mockResolvedValue([{ id: 'p1' }]);
    const store = useDownloadProfiles();

    await store.ensureLoaded();
    await store.ensureLoaded();

    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith('profiles:list');
    expect(store.profiles.value).toEqual([{ id: 'p1' }]);
  });

  it('reloads explicitly after initialization', async () => {
    const store = useDownloadProfiles();
    h.invoke.mockResolvedValueOnce([{ id: 'a' }]).mockResolvedValueOnce([{ id: 'b' }]);

    await store.ensureLoaded();
    await store.load();

    expect(h.invoke).toHaveBeenCalledTimes(2);
    expect(store.profiles.value).toEqual([{ id: 'b' }]);
  });

  it('clears profiles when loading fails', async () => {
    h.invoke.mockRejectedValue(new Error('ipc down'));
    const store = useDownloadProfiles();

    await store.load();

    expect(store.profiles.value).toEqual([]);
  });

  it('saves a new profile', async () => {
    h.invoke.mockResolvedValue([{ id: 'new' }]);
    const store = useDownloadProfiles();

    await store.save('Name', { format: 'mp3' } as never);

    expect(h.invoke).toHaveBeenCalledWith('profiles:save', {
      name: 'Name',
      config: { format: 'mp3' }
    });
    expect(store.profiles.value).toEqual([{ id: 'new' }]);
  });

  it('updates an existing profile by id', async () => {
    h.invoke.mockResolvedValue([{ id: 'p1', name: 'Updated' }]);
    const store = useDownloadProfiles();

    await store.save('Updated', {} as never, 'p1');

    expect(h.invoke).toHaveBeenCalledWith('profiles:save', {
      id: 'p1',
      name: 'Updated',
      config: {}
    });
  });

  it('keeps profiles when saving returns null', async () => {
    h.invoke.mockResolvedValue(null);
    const store = useDownloadProfiles();
    store.profiles.value = [{ id: 'old' }] as never;

    await store.save('Name', {} as never);

    expect(store.profiles.value).toEqual([{ id: 'old' }]);
  });

  it('swallows save failures', async () => {
    h.invoke.mockRejectedValue(new Error('readonly'));
    const store = useDownloadProfiles();

    await expect(store.save('Name', {} as never)).resolves.toBeUndefined();
  });

  it('removes a profile', async () => {
    h.invoke.mockResolvedValue([]);
    const store = useDownloadProfiles();
    store.profiles.value = [{ id: 'p1' }] as never;

    await store.remove('p1');

    expect(h.invoke).toHaveBeenCalledWith('profiles:delete', 'p1');
    expect(store.profiles.value).toEqual([]);
  });

  it('keeps profiles when removal fails', async () => {
    h.invoke.mockRejectedValue(new Error('busy'));
    const store = useDownloadProfiles();
    store.profiles.value = [{ id: 'p1' }] as never;

    await store.remove('p1');

    expect(store.profiles.value).toEqual([{ id: 'p1' }]);
  });
});
