import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { guardBootStep } from '../bootGuard';

describe('guardBootStep', () => {
  it('resolves and reports the error when a step throws', async () => {
    const onError = vi.fn();
    await expect(
      guardBootStep(() => {
        throw new Error('boom');
      }, onError)
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe('boom');
  });

  it('resolves and reports when an async step rejects', async () => {
    const onError = vi.fn();
    await guardBootStep(async () => {
      throw new Error('async boom');
    }, onError);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('does not report when the step succeeds', async () => {
    const onError = vi.fn();
    const ran = vi.fn();
    await guardBootStep(() => ran(), onError);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('App.vue boot guard wiring', () => {
  const APP = readFileSync(join(process.cwd(), 'src/renderer/src/App.vue'), 'utf8');

  it('guards its pre-readiness boot steps so rendererReady always runs', () => {
    expect(APP).toMatch(/guardBootStep/);
    expect(APP).toMatch(/app:rendererReady/);
  });
});
