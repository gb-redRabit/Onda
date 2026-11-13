import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({
  createdListeners: [] as Array<(event: unknown, contents: Record<string, unknown>) => void>
}));

vi.mock('electron', () => ({
  session: { fromPartition: vi.fn() },
  app: {
    on: vi.fn((ev: string, cb: (event: unknown, contents: Record<string, unknown>) => void) => {
      if (ev === 'web-contents-created') h.createdListeners.push(cb);
    })
  }
}));

import { installWebviewGuard, previewUserAgent, PREVIEW_PARTITION } from '../preview-session';

describe('previewUserAgent', () => {
  it('looks like desktop Chrome and never exposes Electron', () => {
    const ua = previewUserAgent();
    expect(ua).toContain('Chrome/');
    expect(ua).toMatch(/Mozilla\/5\.0/);
    expect(ua).not.toContain('Electron');
  });
});

describe('PREVIEW_PARTITION', () => {
  it('is a namespaced persistent partition', () => {
    expect(PREVIEW_PARTITION).toBe('persist:onda-preview');
  });
});

describe('installWebviewGuard', () => {
  it('forces PREVIEW_PARTITION, blocks non-http(s) src and denies window.open on webviews', () => {
    installWebviewGuard();
    expect(h.createdListeners.length).toBeGreaterThan(0);

    const setWindowOpenHandler = vi.fn();
    let attachListener:
      | ((
          ev: { preventDefault: () => void },
          prefs: Record<string, unknown>,
          params: Record<string, string>
        ) => void)
      | undefined;

    h.createdListeners[0](
      {},
      {
        getType: () => 'webview',
        setWindowOpenHandler,
        on: (ev: string, fn: typeof attachListener) => {
          if (ev === 'will-attach-webview') attachListener = fn;
        }
      }
    );

    expect(setWindowOpenHandler).toHaveBeenCalledOnce();
    const openHandler = setWindowOpenHandler.mock.calls[0][0] as () => { action: string };
    expect(openHandler()).toEqual({ action: 'deny' });

    const prefs: Record<string, unknown> = { preload: 'x.js', nodeIntegration: true };
    const ev1 = { preventDefault: vi.fn() };
    attachListener!(ev1, prefs, { src: 'https://player.example/embed' });
    expect(ev1.preventDefault).not.toHaveBeenCalled();
    expect(prefs.partition).toBe(PREVIEW_PARTITION);
    expect(prefs.preload).toBeUndefined();
    expect(prefs.sandbox).toBe(true);

    const ev2 = { preventDefault: vi.fn() };
    attachListener!(ev2, {}, { src: 'file:///C:/Windows/win.ini' });
    expect(ev2.preventDefault).toHaveBeenCalledOnce();
  });

  it('blocks a different webview partition but allows the preview one', () => {
    installWebviewGuard();
    let attachListener:
      | ((
          ev: { preventDefault: () => void },
          prefs: Record<string, unknown>,
          params: Record<string, string>
        ) => void)
      | undefined;

    h.createdListeners.at(-1)!(
      {},
      {
        getType: () => 'webview',
        setWindowOpenHandler: vi.fn(),
        on: (ev: string, fn: typeof attachListener) => {
          if (ev === 'will-attach-webview') attachListener = fn;
        }
      }
    );

    const blocked = { preventDefault: vi.fn() };
    attachListener!(blocked, {}, { src: 'https://a', partition: 'persist:other' });
    expect(blocked.preventDefault).toHaveBeenCalledOnce();

    const allowed = { preventDefault: vi.fn() };
    attachListener!(allowed, {}, { src: 'https://a', partition: PREVIEW_PARTITION });
    expect(allowed.preventDefault).not.toHaveBeenCalled();
  });

  it('does not add window-open handlers to non-webview contents', () => {
    installWebviewGuard();
    const setWindowOpenHandler = vi.fn();
    const attach = vi.fn();

    h.createdListeners.at(-1)!({}, { getType: () => 'window', setWindowOpenHandler, on: attach });

    expect(setWindowOpenHandler).not.toHaveBeenCalled();
    expect(attach).toHaveBeenCalledWith('will-attach-webview', expect.any(Function));
  });

  it('installs the guard only once', () => {
    const before = h.createdListeners.length;
    installWebviewGuard();
    installWebviewGuard();

    expect(h.createdListeners).toHaveLength(before);
  });
});
