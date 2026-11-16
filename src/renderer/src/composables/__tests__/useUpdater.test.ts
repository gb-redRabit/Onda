import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUpdater, __resetUpdater } from '../useUpdater';

let handler: ((payload: unknown) => void) | null = null;
const downloadUpdate = vi.fn(async () => true);
const installUpdate = vi.fn();
const getUpdaterState = vi.fn(async () => ({
  status: 'idle' as const,
  current: '1.0.0',
  version: '',
  progress: 0,
  error: '',
  enabled: true
}));

beforeEach(() => {
  __resetUpdater();
  handler = null;
  downloadUpdate.mockClear();
  installUpdate.mockClear();
  getUpdaterState.mockClear();
  (window as unknown as { api: unknown }).api = {
    on: vi.fn((channel: string, cb: (payload: unknown) => void) => {
      if (channel === 'updater:event') handler = cb;
      return () => {};
    }),
    getUpdaterState,
    downloadUpdate,
    installUpdate
  };
});

describe('useUpdater', () => {
  it('shows the banner and tracks the version when an update is available', () => {
    const u = useUpdater();
    handler!({ event: 'update-available', version: '2.0.0' });
    expect(u.status.value).toBe('available');
    expect(u.version.value).toBe('2.0.0');
    expect(u.show.value).toBe(true);
  });

  it('tracks download progress and the downloaded state', () => {
    const u = useUpdater();
    handler!({ event: 'download-progress', percent: 42 });
    expect(u.status.value).toBe('downloading');
    expect(u.progress.value).toBe(42);
    expect(u.show.value).toBe(true);

    handler!({ event: 'update-downloaded', version: '2.0.0' });
    expect(u.status.value).toBe('downloaded');
    expect(u.progress.value).toBe(100);
  });

  it('dismisses the banner but shows it again for a new version', () => {
    const u = useUpdater();
    handler!({ event: 'update-available', version: '2.0.0' });
    u.dismiss();
    expect(u.show.value).toBe(false);

    handler!({ event: 'update-available', version: '3.0.0' });
    expect(u.show.value).toBe(true);
  });

  it('forwards download and install to the bridge', () => {
    const u = useUpdater();
    u.download();
    u.install();
    expect(downloadUpdate).toHaveBeenCalledTimes(1);
    expect(installUpdate).toHaveBeenCalledTimes(1);
  });

  it('hides the banner for non-actionable states', () => {
    const u = useUpdater();
    handler!({ event: 'checking-for-update' });
    expect(u.show.value).toBe(false);
    handler!({ event: 'update-not-available' });
    expect(u.show.value).toBe(false);
    handler!({ event: 'error', error: 'boom' });
    expect(u.show.value).toBe(false);
    expect(u.error.value).toBe('boom');
  });
});

describe('updater edge events', () => {
  it('defaults missing event fields', () => {
    const u = useUpdater();
    handler!({ event: 'update-available' });
    expect(u.version.value).toBe('');

    handler!({ event: 'download-progress' });
    expect(u.progress.value).toBe(0);

    handler!({ event: 'update-downloaded', version: '2.0.0' });
    handler!({ event: 'update-downloaded' });
    expect(u.version.value).toBe('2.0.0');

    handler!({ event: 'error' });
    expect(u.error.value).toBe('');
  });

  it('subscribes and hydrates only once', async () => {
    useUpdater();
    await Promise.resolve();
    useUpdater();
    await Promise.resolve();

    expect(getUpdaterState).toHaveBeenCalledTimes(1);
  });

  it('works without a preload bridge', () => {
    delete (window as { api?: unknown }).api;
    const u = useUpdater();
    expect(u.show.value).toBe(false);
  });

  it('ignores empty or failing updater state', async () => {
    getUpdaterState.mockResolvedValueOnce(null as never);
    const u = useUpdater();
    await Promise.resolve();
    expect(u.status.value).toBe('idle');

    __resetUpdater();
    getUpdaterState.mockRejectedValueOnce(new Error('down'));
    const u2 = useUpdater();
    await Promise.resolve();
    expect(u2.status.value).toBe('idle');
  });
});
