import { describe, expect, it, vi } from 'vitest';
import { ref, shallowRef } from 'vue';
import type { PluginCommandEntry } from '../pluginShim';
import type { PluginWorkerHandle } from '../pluginWorker';
import { createPluginCommands } from '../pluginCommands';

// Only `track:play` counts as a known hook in these tests.
vi.mock('@renderer/utils/pluginHooks', () => ({
  isKnownHook: (name: string) => name === 'track:play'
}));

type Command = PluginCommandEntry & { pluginId?: string };

function setup() {
  const commands = ref<PluginCommandEntry[]>([
    { id: 'c1', label: 'One', location: 'audio-view', shortcut: 'Ctrl+1', pluginId: 'p1' },
    { id: 'c2', label: 'Two', location: 'library' },
    { id: 'c3', label: 'Three', pluginId: 'missing' },
    { id: 'c4', label: 'Four', pluginId: 'p3' }
  ] as Command[]);
  const postHook = vi.fn();
  const postInvokeCommand = vi.fn();
  const workers = shallowRef<Record<string, PluginWorkerHandle>>({
    p1: { postHook, postInvokeCommand, terminate: vi.fn() },
    p3: { postHook: vi.fn(), postInvokeCommand: vi.fn(), terminate: vi.fn() },
    p4: { postHook: vi.fn(), postInvokeCommand: vi.fn(), terminate: vi.fn() }
  });
  const readyWorkers = new Set(['p1', 'p4']);
  const getManifest = vi.fn((id: string) => ({
    hooks: id === 'p1' ? ['track:play'] : ['track:end']
  }));
  const logPush = vi.fn();
  const api = createPluginCommands({ commands, workers, readyWorkers, getManifest, logPush });

  return {
    api,
    commands,
    workers,
    readyWorkers,
    getManifest,
    logPush,
    postHook,
    postInvokeCommand
  };
}

describe('emitHook', () => {
  it('ignores unknown hook names', () => {
    const { api, postHook, getManifest } = setup();

    api.emitHook('track:unknown', {} as never);

    expect(postHook).not.toHaveBeenCalled();
    expect(getManifest).not.toHaveBeenCalled();
  });

  it('reaches only ready workers that subscribe to the hook', () => {
    const { api, postHook, readyWorkers, workers } = setup();
    const p4Hook = vi.mocked(workers.value.p4!.postHook);
    const p3Hook = vi.mocked(workers.value.p3!.postHook);

    api.emitHook('track:play', { track: 1 } as never);

    expect(postHook).toHaveBeenCalledWith('track:play', { track: 1 });
    // p4 is ready but does not subscribe; p3 subscribes but is not ready.
    expect(p4Hook).not.toHaveBeenCalled();
    expect(p3Hook).not.toHaveBeenCalled();

    readyWorkers.delete('p1');
    api.emitHook('track:play', {} as never);
    expect(postHook).toHaveBeenCalledTimes(1);
  });

  it('logs worker failures and keeps going', () => {
    const { api, postHook, logPush } = setup();
    postHook.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    api.emitHook('track:play', {} as never);

    expect(logPush).toHaveBeenCalledWith('p1', expect.stringContaining('boom'));

    postHook.mockImplementationOnce(() => {
      throw 'plain failure';
    });
    api.emitHook('track:play', {} as never);

    expect(logPush).toHaveBeenLastCalledWith('p1', expect.stringContaining('plain failure'));
  });
});

describe('commands', () => {
  it('filters commands by location', () => {
    const { api } = setup();

    expect(api.commandsIn('audio-view').map((c) => c.id)).toEqual(['c1']);
    expect(api.commandsIn('library').map((c) => c.id)).toEqual(['c2']);
    expect(api.commandsIn('nowhere')).toEqual([]);
  });

  it('dispatches by shortcut and reports misses', () => {
    const { api, postInvokeCommand } = setup();

    expect(api.dispatchShortcut('Ctrl+1')).toBe(true);
    expect(postInvokeCommand).toHaveBeenCalledWith('c1', undefined);

    expect(api.dispatchShortcut('Ctrl+9')).toBe(false);
  });

  it('skips unknown, orphaned and unready commands', () => {
    const { api, postInvokeCommand } = setup();

    api.dispatchCommand('nope');
    api.dispatchCommand('c2');
    api.dispatchCommand('c3');
    api.dispatchCommand('c4');

    expect(postInvokeCommand).not.toHaveBeenCalled();
  });

  it('forwards the payload and logs invoke failures', () => {
    const { api, postInvokeCommand, logPush } = setup();

    api.dispatchCommand('c1', { value: 2 } as never);
    expect(postInvokeCommand).toHaveBeenCalledWith('c1', { value: 2 });

    postInvokeCommand.mockImplementationOnce(() => {
      throw new Error('invoke failed');
    });
    api.dispatchCommand('c1');
    expect(logPush).toHaveBeenCalledWith('p1', expect.stringContaining('invoke failed'));

    postInvokeCommand.mockImplementationOnce(() => {
      throw 42;
    });
    api.dispatchCommand('c1');
    expect(logPush).toHaveBeenLastCalledWith('p1', expect.stringContaining('42'));
  });

  it('invokes a command with the provided context', () => {
    const { api, postInvokeCommand } = setup();

    api.invokeCommandWithContext('c1', { context: true } as never);

    expect(postInvokeCommand).toHaveBeenCalledWith('c1', { context: true });
  });
});
