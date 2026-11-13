import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  createApp: vi.fn(),
  mount: vi.fn(),
  app: { name: 'PipVideoApp' }
}));

vi.mock('vue', () => ({ createApp: h.createApp }));
vi.mock('../pip-video/App.vue', () => ({ default: h.app }));
vi.mock('../pip-video/style.css', () => ({}));

beforeEach(() => {
  h.createApp.mockReset().mockReturnValue({ mount: h.mount });
  h.mount.mockClear();
  window.location.hash = '';
});

describe('video PiP entry', () => {
  it('mounts without preview for a normal window', async () => {
    await import('../pip-video-main');

    expect(h.createApp).toHaveBeenCalledWith(h.app, { preview: false });
    expect(h.mount).toHaveBeenCalledWith('#app');
  });

  it('enables preview from the hash', async () => {
    window.location.hash = '#preview';
    vi.resetModules();

    await import('../pip-video-main');

    expect(h.createApp).toHaveBeenCalledWith(h.app, { preview: true });
    expect(h.mount).toHaveBeenCalledWith('#app');
  });
});
