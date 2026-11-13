import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  createFromPath: vi.fn()
}));

vi.mock('electron', () => ({ nativeImage: { createFromPath: h.createFromPath } }));

import { trayIcon, windowIcon } from '../window-icon';

async function withPlatform<T>(value: NodeJS.Platform, run: () => T): Promise<T> {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value, configurable: true });
  try {
    return run();
  } finally {
    Object.defineProperty(process, 'platform', { value: original, configurable: true });
  }
}

function image(empty: boolean) {
  return { isEmpty: () => empty };
}

beforeEach(() => {
  h.createFromPath.mockReset();
});

describe('windowIcon', () => {
  it('uses the multi-resolution ico on Windows', async () => {
    const result = await withPlatform('win32', () => windowIcon());

    expect(result).toMatch(/\.ico(?:$|\?)/);
  });

  it('uses the png elsewhere', async () => {
    const result = await withPlatform('linux', () => windowIcon());

    expect(result).toMatch(/\.png(?:$|\?)/);
  });
});

describe('trayIcon', () => {
  it('prefers the ico on Windows', async () => {
    const full = image(false);
    h.createFromPath.mockReturnValue(full);

    const result = await withPlatform('win32', () => trayIcon());

    expect(result).toBe(full);
    expect(h.createFromPath).toHaveBeenCalledTimes(1);
    expect(h.createFromPath.mock.calls[0][0]).toMatch(/\.ico(?:$|\?)/);
  });

  it('falls back to the png when the ico has no image', async () => {
    const full = image(false);
    h.createFromPath.mockReturnValueOnce(image(true)).mockReturnValueOnce(full);

    const result = await withPlatform('win32', () => trayIcon());

    expect(result).toBe(full);
    expect(h.createFromPath).toHaveBeenCalledTimes(2);
    expect(h.createFromPath.mock.calls[1][0]).toMatch(/\.png(?:$|\?)/);
  });

  it('prefers the png outside Windows', async () => {
    h.createFromPath.mockReturnValue(image(false));

    await withPlatform('darwin', () => trayIcon());

    expect(h.createFromPath.mock.calls[0][0]).toMatch(/\.png(?:$|\?)/);
  });

  it('returns null when no candidate has an image', async () => {
    h.createFromPath.mockReturnValue(image(true));

    await expect(withPlatform('win32', () => trayIcon())).resolves.toBeNull();
    expect(h.createFromPath).toHaveBeenCalledTimes(2);
  });
});
