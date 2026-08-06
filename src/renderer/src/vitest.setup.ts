import { vi } from 'vitest';

if (typeof globalThis.requestIdleCallback === 'undefined') {
  globalThis.requestIdleCallback = (cb: IdleRequestCallback) =>
    setTimeout(cb, 0) as unknown as number;
}

(window as any).api = {
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(() => () => {}),
  getCover: vi.fn(),
  getDuration: vi.fn(),
  findExternalSubtitles: vi.fn(),
  readSubtitleFile: vi.fn(),
  listEmbeddedSubtitles: vi.fn(),
  extractEmbeddedSubtitle: vi.fn(),
  extractSubtitleFonts: vi.fn()
};
