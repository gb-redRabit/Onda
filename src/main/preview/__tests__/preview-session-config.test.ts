import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  setUserAgent: vi.fn(),
  fromPartition: vi.fn(),
  warn: vi.fn()
}));

vi.mock('electron', () => ({
  session: { fromPartition: h.fromPartition },
  app: { on: vi.fn() }
}));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: h.warn, info: vi.fn(), error: vi.fn() }
}));

type PreviewSessionApi = typeof import('../preview-session');

let api: PreviewSessionApi;

beforeEach(async () => {
  h.setUserAgent.mockReset();
  h.fromPartition.mockReset().mockReturnValue({ setUserAgent: h.setUserAgent });
  h.warn.mockClear();
  vi.resetModules();
  api = await import('../preview-session');
});

describe('previewSession', () => {
  it('returns the isolated partition session', () => {
    const session = api.previewSession();

    expect(h.fromPartition).toHaveBeenCalledWith('persist:onda-preview');
    expect(session).toEqual({ setUserAgent: h.setUserAgent });
  });
});

describe('configurePreviewSession', () => {
  it('sets the desktop user agent once', () => {
    const first = api.configurePreviewSession();
    const second = api.configurePreviewSession();

    expect(first).toBe(second);
    expect(h.setUserAgent).toHaveBeenCalledTimes(1);
    expect(h.setUserAgent).toHaveBeenCalledWith(api.previewUserAgent());
  });

  it('logs a rejected user agent update', () => {
    const error = new Error('locked');
    h.setUserAgent.mockImplementation(() => {
      throw error;
    });

    const session = api.configurePreviewSession();

    expect(session).toEqual({ setUserAgent: h.setUserAgent });
    expect(h.warn).toHaveBeenCalledWith('preview', 'setUserAgent failed', error);
  });
});
