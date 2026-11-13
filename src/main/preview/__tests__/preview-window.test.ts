import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handle: vi.fn(),
  installWebviewGuard: vi.fn(),
  configurePreviewSession: vi.fn(),
  installPreviewAdblock: vi.fn(),
  setPreviewAdblock: vi.fn()
}));

vi.mock('electron', () => ({ ipcMain: { handle: h.handle } }));
vi.mock('../preview-session', () => ({
  configurePreviewSession: h.configurePreviewSession,
  installWebviewGuard: h.installWebviewGuard
}));
vi.mock('../adblock', () => ({
  installPreviewAdblock: h.installPreviewAdblock,
  setPreviewAdblock: h.setPreviewAdblock
}));

import { registerPreviewHandlers } from '../preview-window';

type Handler = (event: unknown, value?: unknown) => unknown;

function handler(channel: string): Handler {
  expect(h.handle).toHaveBeenCalledWith(channel, expect.any(Function));
  const call = h.handle.mock.calls.find(([name]) => name === channel);
  return call![1] as Handler;
}

beforeEach(() => {
  h.handle.mockClear();
  h.installWebviewGuard.mockClear();
  h.configurePreviewSession.mockClear();
  h.installPreviewAdblock.mockClear();
  h.setPreviewAdblock.mockClear();
});

describe('registerPreviewHandlers', () => {
  it('installs the webview guard and ad blocker', () => {
    registerPreviewHandlers();

    expect(h.installWebviewGuard).toHaveBeenCalledTimes(1);
    expect(h.installPreviewAdblock).toHaveBeenCalledTimes(1);
  });

  it('toggles the ad blocker only for the literal true value', () => {
    registerPreviewHandlers();

    expect(h.handle).toHaveBeenCalledWith('preview:setAdblock', expect.any(Function));
    const setAdblock = handler('preview:setAdblock');

    expect(setAdblock({}, true)).toBe(true);
    expect(h.setPreviewAdblock).toHaveBeenLastCalledWith(true);

    expect(setAdblock({}, false)).toBe(false);
    expect(h.setPreviewAdblock).toHaveBeenLastCalledWith(false);

    expect(setAdblock({}, 'true')).toBe(false);
    expect(h.setPreviewAdblock).toHaveBeenLastCalledWith(false);

    expect(setAdblock({}, undefined)).toBe(false);
    expect(h.setPreviewAdblock).toHaveBeenCalledTimes(4);
  });

  it('prepares the preview session before embedding', () => {
    registerPreviewHandlers();
    const prepare = handler('preview:prepare');

    expect(prepare({})).toEqual({ success: true });
    expect(h.configurePreviewSession).toHaveBeenCalledTimes(1);
  });
});
