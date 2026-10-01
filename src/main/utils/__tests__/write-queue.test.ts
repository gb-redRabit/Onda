import { describe, it, expect } from 'vitest';
import { WriteQueue } from '../write-queue';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('WriteQueue', () => {
  it('runs tasks in order, one at a time', async () => {
    const queue = new WriteQueue();
    const order: number[] = [];
    let active = 0;
    let maxActive = 0;

    for (let i = 0; i < 5; i++) {
      queue.push(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await tick();
        order.push(i);
        active--;
      });
    }

    await queue.whenIdle();
    expect(order).toEqual([0, 1, 2, 3, 4]);
    expect(maxActive).toBe(1);
  });

  it('continues after a failing task', async () => {
    const queue = new WriteQueue();
    const ran: string[] = [];

    queue.push(async () => {
      ran.push('a');
      throw new Error('boom');
    });
    queue.push(async () => {
      ran.push('b');
    });

    await queue.whenIdle();
    expect(ran).toEqual(['a', 'b']);
  });

  it('whenIdle resolves immediately when there is nothing queued', async () => {
    const queue = new WriteQueue();
    await expect(queue.whenIdle()).resolves.toBeUndefined();
  });
});
