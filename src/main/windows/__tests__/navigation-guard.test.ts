import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  is: { dev: false },
  isAllowed: vi.fn(),
  warn: vi.fn()
}));

vi.mock('electron', () => ({ BrowserWindow: class {} }));
vi.mock('@electron-toolkit/utils', () => ({ is: h.is }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('../navigation-policy', () => ({ isAllowedNavigationUrl: h.isAllowed }));

import { installNavigationGuard } from '../navigation-guard';

const env = process.env as Record<string, string | undefined>;

function fakeWindow() {
  const listeners: Record<string, (event: { preventDefault: () => void }, url: string) => void> =
    {};
  const win = {
    webContents: {
      on: (channel: string, listener: (typeof listeners)[string]) => {
        listeners[channel] = listener;
      }
    }
  };
  return { win, listeners };
}

beforeEach(() => {
  h.is.dev = false;
  h.isAllowed.mockReset().mockReturnValue(true);
  h.warn.mockClear();
  delete env['ELECTRON_RENDERER_URL'];
});

afterEach(() => {
  delete env['ELECTRON_RENDERER_URL'];
});

describe('installNavigationGuard', () => {
  it('listens for main-frame navigation', () => {
    const { win, listeners } = fakeWindow();

    installNavigationGuard(win as never);

    expect(Object.keys(listeners)).toEqual(['will-navigate']);
  });

  it('allows internal navigation without warning', () => {
    const { win, listeners } = fakeWindow();
    installNavigationGuard(win as never);
    const event = { preventDefault: vi.fn() };

    listeners['will-navigate'](event, 'file:///app/index.html');

    expect(h.isAllowed).toHaveBeenCalledWith('file:///app/index.html', undefined, {});
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(h.warn).not.toHaveBeenCalled();
  });

  it('blocks and logs external navigation', () => {
    h.isAllowed.mockReturnValue(false);
    const { win, listeners } = fakeWindow();
    installNavigationGuard(win as never);
    const event = { preventDefault: vi.fn() };

    listeners['will-navigate'](event, 'https://evil.example');

    expect(h.warn).toHaveBeenCalledWith('main', 'blocked navigation to', 'https://evil.example');
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('passes the dev renderer URL and policy options in development', () => {
    h.is.dev = true;
    env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';
    const { win, listeners } = fakeWindow();
    installNavigationGuard(win as never, { allowExternal: true } as never);

    listeners['will-navigate']({ preventDefault: vi.fn() }, 'http://localhost:5173/');

    expect(h.isAllowed).toHaveBeenCalledWith('http://localhost:5173/', 'http://localhost:5173', {
      allowExternal: true
    });
  });

  it('ignores the renderer URL outside development', () => {
    env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';
    const { win, listeners } = fakeWindow();
    installNavigationGuard(win as never);

    listeners['will-navigate']({ preventDefault: vi.fn() }, 'file:///app/index.html');

    expect(h.isAllowed).toHaveBeenCalledWith('file:///app/index.html', undefined, {});
  });
});
