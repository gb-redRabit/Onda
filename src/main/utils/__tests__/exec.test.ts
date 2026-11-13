import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const h = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('child_process', () => ({ spawn: h.spawn }));

import { runCommand, runCommandResult } from '../exec';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

function spawnChild(): FakeChild {
  const child = new FakeChild();
  h.spawn.mockReturnValueOnce(child);
  return child;
}

beforeEach(() => {
  h.spawn.mockReset();
});

describe('runCommandResult', () => {
  it('captures stdout and stderr and passes spawn options', async () => {
    const child = spawnChild();
    const promise = runCommandResult('ffprobe', ['-v', 'quiet'], {
      timeout: 5000,
      cwd: '/tmp'
    });

    expect(h.spawn).toHaveBeenCalledWith('ffprobe', ['-v', 'quiet'], {
      windowsHide: true,
      timeout: 5000,
      cwd: '/tmp'
    });
    child.stdout.emit('data', Buffer.from('out'));
    child.stderr.emit('data', Buffer.from('err'));
    child.emit('close', 0, null);

    await expect(promise).resolves.toEqual({ stdout: 'out', stderr: 'err' });
  });

  it('resolves with empty output for a child without stdio streams', async () => {
    const child = new FakeChild();
    child.stdout = undefined as never;
    child.stderr = undefined as never;
    h.spawn.mockReturnValueOnce(child);

    const promise = runCommandResult('true', []);
    child.emit('close', 0, null);

    await expect(promise).resolves.toEqual({ stdout: '', stderr: '' });
  });

  it('rejects before spawning when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(runCommandResult('x', [], { signal: controller.signal })).rejects.toThrow(
      'Command aborted'
    );
    expect(h.spawn).not.toHaveBeenCalled();
  });

  it('kills the process and rejects when aborted mid-run', async () => {
    const child = spawnChild();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const promise = runCommandResult('x', [], { signal: controller.signal });

    controller.abort();

    await expect(promise).rejects.toThrow('Command aborted');
    expect(child.kill).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('rejects and kills when output exceeds maxBuffer', async () => {
    const child = spawnChild();
    const promise = runCommandResult('x', [], { maxBuffer: 5 });

    child.stdout.emit('data', Buffer.from('123456'));

    await expect(promise).rejects.toThrow('Command output exceeded 5 bytes and was killed');
    expect(child.kill).toHaveBeenCalled();
  });

  it('rejects when the child cannot be spawned', async () => {
    const child = spawnChild();
    const failure = new Error('ENOENT');
    const promise = runCommandResult('missing', []);

    child.emit('error', failure);

    await expect(promise).rejects.toBe(failure);
  });

  it('rejects when the process is killed by a signal', async () => {
    const child = spawnChild();
    const promise = runCommandResult('x', []);

    child.emit('close', null, 'SIGKILL');

    await expect(promise).rejects.toThrow('Process killed by signal SIGKILL');
  });

  it('uses stderr as the rejection reason for a non-zero exit', async () => {
    const child = spawnChild();
    const promise = runCommandResult('x', []);

    child.stderr.emit('data', Buffer.from('  boom  \n'));
    child.emit('close', 2, null);

    await expect(promise).rejects.toThrow('boom');
  });

  it('falls back to the exit code when stderr is empty', async () => {
    const child = spawnChild();
    const promise = runCommandResult('x', []);

    child.emit('close', 3, null);

    await expect(promise).rejects.toThrow('Command failed with exit code 3');
  });

  it('ignores output that arrives after the process settled', async () => {
    const child = spawnChild();
    const promise = runCommandResult('x', []);

    child.emit('close', 0, null);
    child.stdout.emit('data', Buffer.from('late'));
    child.emit('error', new Error('late'));

    await expect(promise).resolves.toEqual({ stdout: '', stderr: '' });
  });

  it('ignores a close event after a spawn error', async () => {
    const child = spawnChild();
    const promise = runCommandResult('x', []);
    const failure = new Error('ENOENT');

    child.emit('error', failure);
    child.emit('close', 1, null);

    await expect(promise).rejects.toBe(failure);
  });
});

describe('runCommand', () => {
  it('returns only stdout', async () => {
    const child = spawnChild();
    const promise = runCommand('echo', ['hi']);

    child.stdout.emit('data', Buffer.from('hi'));
    child.emit('close', 0, null);

    await expect(promise).resolves.toBe('hi');
  });
});
