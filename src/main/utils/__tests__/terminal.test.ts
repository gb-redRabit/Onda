import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { terminalCandidates, spawnFirstAvailable } from '../terminal';

function fakeChild(outcome: 'spawn' | 'error'): ChildProcess {
  const child = new EventEmitter() as unknown as ChildProcess;
  (child as unknown as { unref: () => void }).unref = vi.fn();
  setImmediate(() => child.emit(outcome));
  return child;
}

describe('terminalCandidates', () => {
  it('uses cmd on win32', () => {
    expect(terminalCandidates('win32', 'C:/x')[0]).toEqual({
      cmd: 'cmd',
      args: ['/K', 'cd', '/d', 'C:/x']
    });
  });

  it('uses Terminal on darwin', () => {
    expect(terminalCandidates('darwin', '/x')[0]).toEqual({
      cmd: 'open',
      args: ['-a', 'Terminal', '/x']
    });
  });

  it('offers real Linux emulators and never the macOS "open"', () => {
    const cmds = terminalCandidates('linux', '/x').map((c) => c.cmd);
    expect(cmds).toContain('x-terminal-emulator');
    expect(cmds).toContain('xterm');
    expect(cmds).not.toContain('open');
  });
});

describe('spawnFirstAvailable', () => {
  it('falls back to the next candidate when the first errors', async () => {
    const spawnFn = vi
      .fn()
      .mockReturnValueOnce(fakeChild('error'))
      .mockReturnValueOnce(fakeChild('spawn'));

    const launched = await spawnFirstAvailable(terminalCandidates('linux', '/x'), spawnFn as never);

    expect(launched).toBe(true);
    expect(spawnFn).toHaveBeenCalledTimes(2);
  });

  it('returns false when no candidate launches', async () => {
    const spawnFn = vi.fn(() => fakeChild('error'));
    expect(await spawnFirstAvailable([{ cmd: 'nope', args: [] }], spawnFn as never)).toBe(false);
  });
});
