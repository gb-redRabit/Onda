import { beforeEach, describe, expect, it, vi } from 'vitest';

// The hash worker runs in its own thread so hashing a multi-gigabyte file cannot
// block IPC. Failures (read error, worker crash, early exit) must settle exactly once.

interface FakeWorker {
  src: string;
  options: { eval?: boolean; workerData?: { path?: string } };
  terminated: boolean;
  emit(event: string, ...args: unknown[]): void;
  terminate(): Promise<number>;
}

vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events');

  class Worker extends EventEmitter implements FakeWorker {
    src: string;
    options: { eval?: boolean; workerData?: { path?: string } };
    terminated = false;

    constructor(src: string, options: FakeWorker['options']) {
      super();
      this.src = src;
      this.options = options;
      (globalThis as unknown as { __hashWorkers: FakeWorker[] }).__hashWorkers.push(this);
    }

    terminate(): Promise<number> {
      this.terminated = true;
      return Promise.resolve(0);
    }
  }

  (globalThis as unknown as { __hashWorkers: FakeWorker[] }).__hashWorkers = [];
  return { Worker };
});

import { sha256File } from '../hash-file';

function workers(): FakeWorker[] {
  return (globalThis as unknown as { __hashWorkers: FakeWorker[] }).__hashWorkers;
}

function lastWorker(): FakeWorker {
  return workers().at(-1)!;
}

beforeEach(() => {
  workers().length = 0;
});

describe('sha256File', () => {
  it('resolves with the digest reported by the worker', async () => {
    const promise = sha256File('/music/a.flac');
    const worker = lastWorker();

    expect(worker.options).toEqual({ eval: true, workerData: { path: '/music/a.flac' } });
    expect(worker.src).toContain("require('node:crypto')");

    worker.emit('message', { hash: 'abc123' });

    await expect(promise).resolves.toBe('abc123');
    expect(worker.terminated).toBe(true);
  });

  it('rejects when the worker reports a read error', async () => {
    const promise = sha256File('/music/missing.flac');

    lastWorker().emit('message', { error: 'ENOENT: no such file' });

    await expect(promise).rejects.toThrow('ENOENT: no such file');
    expect(lastWorker().terminated).toBe(true);
  });

  it('rejects when the worker itself crashes', async () => {
    const promise = sha256File('/music/a.flac');
    const failure = new Error('worker crashed');

    lastWorker().emit('error', failure);

    await expect(promise).rejects.toBe(failure);
  });

  it('rejects when the worker exits before reporting a result', async () => {
    const promise = sha256File('/music/a.flac');

    lastWorker().emit('exit', 3);

    await expect(promise).rejects.toThrow('hash worker exited with code 3');
  });

  it('ignores events after the result has settled', async () => {
    const promise = sha256File('/music/a.flac');
    const worker = lastWorker();

    worker.emit('message', { hash: 'done' });
    worker.emit('exit', 1);
    worker.emit('error', new Error('late'));

    await expect(promise).resolves.toBe('done');
  });
});
