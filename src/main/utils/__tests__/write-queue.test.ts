import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WriteQueue, writeJsonAtomic, createWriteLock } from '../write-queue';

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

describe('writeJsonAtomic', () => {
  it('writes JSON, creates parent dirs and leaves no .tmp behind', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onda-wqa-'));
    try {
      const target = join(dir, 'nested', 'data.json');
      await writeJsonAtomic(target, { a: 1, b: [2, 3] });
      expect(JSON.parse(await readFile(target, 'utf-8'))).toEqual({ a: 1, b: [2, 3] });
      const entries = await readdir(join(dir, 'nested'));
      expect(entries).toEqual(['data.json']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('overwrites an existing file in place', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onda-wqa-'));
    try {
      const target = join(dir, 'data.json');
      await writeFile(target, '{"old":true}');
      await writeJsonAtomic(target, { fresh: true });
      expect(JSON.parse(await readFile(target, 'utf-8'))).toEqual({ fresh: true });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('createWriteLock', () => {
  it('serialises tasks and isolates failures from later tasks', async () => {
    const lock = createWriteLock();
    const order: number[] = [];
    const a = lock(async () => {
      await tick();
      order.push(1);
    });
    const b = lock(async () => {
      order.push(2);
      throw new Error('boom');
    });
    const c = lock(async () => {
      order.push(3);
    });
    await expect(b).rejects.toThrow('boom');
    await Promise.all([a, c]);
    expect(order).toEqual([1, 2, 3]);
  });
});
