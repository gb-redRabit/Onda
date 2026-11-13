import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handle: vi.fn()
}));

vi.mock('electron', () => ({ ipcMain: { handle: h.handle } }));

import { registerMediaUrlHandler, setMediaServerUrl } from '../media-url-args';

type Handler = () => string;

function handler(): Handler {
  registerMediaUrlHandler();
  expect(h.handle).toHaveBeenCalledWith('media:getServerUrl', expect.any(Function));
  return h.handle.mock.calls[0][1] as Handler;
}

beforeEach(() => {
  h.handle.mockClear();
});

describe('media server url', () => {
  it('starts empty', () => {
    expect(handler()()).toBe('');
  });

  it('returns the latest url set by the server', () => {
    const get = handler();

    setMediaServerUrl('http://127.0.0.1:1234/?token=abc');
    expect(get()).toBe('http://127.0.0.1:1234/?token=abc');

    setMediaServerUrl('http://127.0.0.1:4321/?token=def');
    expect(get()).toBe('http://127.0.0.1:4321/?token=def');
  });
});
