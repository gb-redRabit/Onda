import { describe, expect, it } from 'vitest';
import { createLimiter } from '../limiter';

describe('createLimiter', () => {
  it('never exceeds the limit and drains queued tasks', async () => {
    const limit = createLimiter(2);
    let active = 0;
    let maxActive = 0;
    const order: number[] = [];

    const task = (value: number) =>
      limit(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push(value);
        active -= 1;
        return value;
      });

    const results = await Promise.all([0, 1, 2, 3, 4].map(task));

    expect(maxActive).toBe(2);
    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(order).toEqual([0, 1, 2, 3, 4]);
    expect(limit.active()).toBe(0);
    expect(limit.pending()).toBe(0);
  });

  it('clamps a non-positive limit to one', async () => {
    const limit = createLimiter(0);

    await expect(limit(async () => 'ok')).resolves.toBe('ok');
    expect(limit.active()).toBe(0);
  });

  it('releases the permit when a task rejects', async () => {
    const limit = createLimiter(1);

    await expect(
      limit(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    await expect(limit(async () => 2)).resolves.toBe(2);
  });
});
