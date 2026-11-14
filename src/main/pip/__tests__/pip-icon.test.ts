import { afterEach, describe, expect, it, vi } from 'vitest';

const PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

afterEach(() => {
  setPlatform(PLATFORM);
  vi.resetModules();
});

describe('pipWindowIcon', () => {
  it('uses the multi-size .ico on Windows', async () => {
    setPlatform('win32');
    vi.resetModules();
    const { pipWindowIcon } = await import('../pip-icon');

    expect(pipWindowIcon()).toContain('icon.ico');
  });

  it('uses the shared PNG elsewhere', async () => {
    setPlatform('linux');
    vi.resetModules();
    const { pipWindowIcon } = await import('../pip-icon');

    expect(pipWindowIcon()).toContain('icon.png');
  });
});
