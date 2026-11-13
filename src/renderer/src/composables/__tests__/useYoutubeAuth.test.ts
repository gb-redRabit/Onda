import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  invoke: vi.fn()
}));

const api = window as unknown as { api: { invoke: typeof h.invoke } };

type UseYoutubeAuth = typeof import('../useYoutubeAuth').useYoutubeAuth;

let useYoutubeAuth: UseYoutubeAuth;

beforeEach(async () => {
  h.invoke.mockReset().mockResolvedValue({ method: 'browser', loggedIn: true });
  api.api = { invoke: h.invoke };
  vi.resetModules();
  ({ useYoutubeAuth } = await import('../useYoutubeAuth'));
});

describe('useYoutubeAuth', () => {
  it('starts logged out', () => {
    expect(useYoutubeAuth().status.value).toEqual({ method: 'none', loggedIn: false });
  });

  it('loads the auth status once', async () => {
    const auth = useYoutubeAuth();

    await auth.ensureLoaded();
    await auth.ensureLoaded();

    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith('yt:authStatus');
    expect(auth.status.value).toEqual({ method: 'browser', loggedIn: true });
  });

  it('shares status across consumers', async () => {
    const first = useYoutubeAuth();
    const second = useYoutubeAuth();
    await first.refresh();

    expect(second.status.value).toEqual({ method: 'browser', loggedIn: true });
  });

  it('refreshes explicitly after initialization', async () => {
    const auth = useYoutubeAuth();
    await auth.ensureLoaded();
    h.invoke.mockResolvedValue({ method: 'none', loggedIn: false });

    await auth.refresh();

    expect(h.invoke).toHaveBeenCalledTimes(2);
    expect(auth.status.value).toEqual({ method: 'none', loggedIn: false });
  });

  it('keeps the last known status on failure', async () => {
    const auth = useYoutubeAuth();
    await auth.ensureLoaded();
    h.invoke.mockRejectedValue(new Error('ipc down'));

    await auth.refresh();

    expect(auth.status.value).toEqual({ method: 'browser', loggedIn: true });
  });
});
