import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  createApp: vi.fn(),
  mount: vi.fn(),
  app: { name: 'AudioPipApp' }
}));

vi.mock('vue', () => ({ createApp: h.createApp }));
vi.mock('../pip-audio/App.vue', () => ({ default: h.app }));
vi.mock('../pip-audio/style.css', () => ({}));

beforeEach(() => {
  h.createApp.mockReset().mockReturnValue({ mount: h.mount });
  h.mount.mockClear();
});

describe('audio PiP entry', () => {
  it('mounts the audio PiP app at the root element', async () => {
    await import('../pip-audio-main');

    expect(h.createApp).toHaveBeenCalledWith(h.app);
    expect(h.mount).toHaveBeenCalledWith('#app');
  });
});
