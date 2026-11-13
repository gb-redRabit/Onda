import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  on: vi.fn(),
  notify: vi.fn(),
  notifyNative: vi.fn(),
  settings: { toast: { showNative: false } },
  t: vi.fn((key: string, params?: { channel: string }) => `${key}:${params?.channel}`)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: h.notify }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));
vi.mock('@renderer/utils/notifications', () => ({ notifyNative: h.notifyNative }));

let handler: ((payload: unknown) => void) | null = null;

beforeEach(() => {
  vi.resetModules();
  handler = null;
  h.on.mockReset().mockImplementation(((_channel: string, cb: (payload: unknown) => void) => {
    handler = cb;
    return () => {};
  }) as never);
  h.notify.mockClear();
  h.notifyNative.mockClear();
  h.t.mockClear();
  h.settings.toast.showNative = false;
  (window as unknown as { api: { on: typeof h.on } }).api = { on: h.on };
});

describe('useNewVideoNotifications', () => {
  it('subscribes once for the app lifetime', async () => {
    const { useNewVideoNotifications } = await import('../useNewVideoNotifications');

    useNewVideoNotifications();
    useNewVideoNotifications();

    expect(h.on).toHaveBeenCalledTimes(1);
    expect(h.on).toHaveBeenCalledWith('yt:newVideos', expect.any(Function));
  });

  it('ignores malformed events', async () => {
    const { useNewVideoNotifications } = await import('../useNewVideoNotifications');
    useNewVideoNotifications();

    handler!(null);
    handler!({ count: 'many', titles: [] });
    handler!({ count: 0, titles: [] });

    expect(h.notify).not.toHaveBeenCalled();
  });

  it('notifies about up to three new videos', async () => {
    const { useNewVideoNotifications } = await import('../useNewVideoNotifications');
    useNewVideoNotifications();

    handler!({
      count: 6,
      channelTitle: 'Channel',
      titles: ['A', '', 'B', 'C', 'D']
    });

    expect(h.t).toHaveBeenCalledWith('youtube.newVideosToastTitle', { channel: 'Channel' });
    const detail = h.notify.mock.calls[0][2] as string;
    expect(detail).toContain('A');
    expect(detail).toContain('B');
    expect(detail).toContain('C');
    expect(detail).not.toContain('D');
    expect(detail).toContain('(+1)');
    expect(h.notifyNative).not.toHaveBeenCalled();
  });

  it('uses the YouTube fallback and omits the detail when no titles remain', async () => {
    const { useNewVideoNotifications } = await import('../useNewVideoNotifications');
    useNewVideoNotifications();

    handler!({ count: 2, titles: [] });

    expect(h.t).toHaveBeenCalledWith('youtube.newVideosToastTitle', { channel: 'YouTube' });
    expect(h.notify).toHaveBeenCalledWith('info', 'youtube.newVideosToastTitle:YouTube', undefined);
  });

  it('shows a native notification when enabled', async () => {
    h.settings.toast.showNative = true;
    const { useNewVideoNotifications } = await import('../useNewVideoNotifications');
    useNewVideoNotifications();

    handler!({ count: 1, channelTitle: 'C', titles: ['A'] });

    expect(h.notifyNative).toHaveBeenCalledWith('youtube.newVideosToastTitle:C', 'A');
  });

  it('shows a native notification with an empty title list', async () => {
    h.settings.toast.showNative = true;
    const { useNewVideoNotifications } = await import('../useNewVideoNotifications');
    useNewVideoNotifications();

    handler!({ count: 1, channelTitle: 'C', titles: [] });

    expect(h.notifyNative).toHaveBeenCalledWith('youtube.newVideosToastTitle:C', undefined);
  });

  it('omits the suffix when every title is listed', async () => {
    const { useNewVideoNotifications } = await import('../useNewVideoNotifications');
    useNewVideoNotifications();

    handler!({ count: 2, channelTitle: 'C', titles: ['A', 'B'] });

    const detail = h.notify.mock.calls[0][2] as string;
    expect(detail).toContain('A');
    expect(detail).toContain('B');
    expect(detail).not.toContain('+');
  });
});
