import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPluginWorker,
  PLUGIN_HEARTBEAT_INTERVAL_MS,
  PLUGIN_HEARTBEAT_TIMEOUT_MS,
  type PluginWorkerOptions
} from '../pluginWorker';

const createUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const revokeUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

class TestWorker {
  static latest: TestWorker | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: unknown[] = [];
  terminated = false;

  constructor(_url: string) {
    TestWorker.latest = this;
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(payload: unknown): void {
    this.onmessage?.({ data: payload } as MessageEvent);
  }
}

function options(
  apiDispatch: PluginWorkerOptions['apiDispatch'] = vi.fn().mockResolvedValue('ok')
): PluginWorkerOptions {
  return {
    id: 'test-plugin',
    code: 'api.on("test", function () {})',
    onReady: vi.fn(),
    onCommand: vi.fn(),
    onCommandRemoved: vi.fn(),
    onLog: vi.fn(),
    onError: vi.fn(),
    apiDispatch
  };
}

const openWorkers: ReturnType<typeof createPluginWorker>[] = [];

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function create(opts: PluginWorkerOptions) {
  const handle = createPluginWorker(opts);
  openWorkers.push(handle);
  return { handle, instance: TestWorker.latest! };
}

beforeEach(() => {
  TestWorker.latest = null;
  openWorkers.length = 0;
  vi.stubGlobal('Worker', TestWorker);
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:plugin-test')
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(() => undefined)
  });
});

afterEach(() => {
  for (const handle of openWorkers) handle.terminate();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (createUrlDescriptor) Object.defineProperty(URL, 'createObjectURL', createUrlDescriptor);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (revokeUrlDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeUrlDescriptor);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('plugin worker resource limits', () => {
  it('terminates a plugin that does not finish initialization', async () => {
    vi.useFakeTimers();
    const opts = options();
    const worker = createPluginWorker(opts);
    const instance = TestWorker.latest!;

    await vi.advanceTimersByTimeAsync(10_000);

    expect(opts.onError).toHaveBeenCalledWith('worker-ready-timeout');
    expect(instance.terminated).toBe(true);
    worker.terminate();
  });

  it('caps concurrent requests to the host API', () => {
    const opts = options(() => new Promise(() => {}));
    const worker = createPluginWorker(opts);
    const instance = TestWorker.latest!;
    instance.emit({ __onda: { type: 'ready' } });

    for (let id = 1; id <= 17; id++) {
      instance.emit({ __onda: { type: 'api-request', id, op: 'query', args: [] } });
    }

    const last = instance.messages.at(-1) as { __onda?: Record<string, unknown> };
    expect(last.__onda).toMatchObject({
      type: 'api-response',
      id: 17,
      ok: false,
      error: 'plugin-api-concurrency-limit'
    });
    worker.terminate();
  });

  it('terminates a worker that stops responding after initialization', async () => {
    vi.useFakeTimers();
    const opts = options();
    const worker = createPluginWorker(opts);
    const instance = TestWorker.latest!;
    instance.emit({ __onda: { type: 'ready' } });

    await vi.advanceTimersByTimeAsync(PLUGIN_HEARTBEAT_INTERVAL_MS + PLUGIN_HEARTBEAT_TIMEOUT_MS);

    expect(opts.onError).toHaveBeenCalledWith('worker-heartbeat-timeout');
    expect(instance.terminated).toBe(true);
    worker.terminate();
  });

  it('keeps a responsive worker alive across heartbeat checks', async () => {
    vi.useFakeTimers();
    const opts = options();
    const worker = createPluginWorker(opts);
    const instance = TestWorker.latest!;
    instance.emit({ __onda: { type: 'ready' } });

    await vi.advanceTimersByTimeAsync(PLUGIN_HEARTBEAT_INTERVAL_MS);
    instance.emit({ __onda: { type: 'pong' } });
    await vi.advanceTimersByTimeAsync(PLUGIN_HEARTBEAT_TIMEOUT_MS);

    expect(opts.onError).not.toHaveBeenCalledWith('worker-heartbeat-timeout');
    expect(instance.terminated).toBe(false);
    worker.terminate();
  });

  it('terminates a worker that floods the renderer with messages', () => {
    const opts = options();
    const worker = createPluginWorker(opts);
    const instance = TestWorker.latest!;
    instance.emit({ __onda: { type: 'ready' } });
    for (let i = 0; i < 300; i++) {
      instance.emit({ __onda: { type: 'log', level: 'info', message: 'spam' } });
    }

    expect(opts.onError).toHaveBeenCalledWith('worker-message-rate-limit');
    expect(instance.terminated).toBe(true);
    worker.terminate();
  });
});

describe('message handling', () => {
  it('ignores malformed envelopes', () => {
    const opts = options();
    const { instance } = create(opts);

    instance.emit(null);
    instance.emit('text');
    instance.emit({});
    instance.emit({ __onda: { type: 42 } });

    expect(opts.onReady).not.toHaveBeenCalled();
    expect(opts.onLog).not.toHaveBeenCalled();
    expect(instance.terminated).toBe(false);
  });

  it('accepts a single ready notification', () => {
    const opts = options();
    const { instance } = create(opts);

    instance.emit({ __onda: { type: 'ready' } });
    instance.emit({ __onda: { type: 'ready' } });

    expect(opts.onReady).toHaveBeenCalledTimes(1);
  });

  it('routes commands, logs and errors to the host', () => {
    const opts = options();
    const { instance } = create(opts);

    const command = { id: 'c1', label: 'Run' };
    instance.emit({ __onda: { type: 'register-command', command } });
    instance.emit({ __onda: { type: 'unregister-command', commandId: 'c1' } });
    instance.emit({ __onda: { type: 'log', level: 'warn', message: 'careful' } });
    instance.emit({ __onda: { type: 'error', message: 'boom' } });

    expect(opts.onCommand).toHaveBeenCalledWith(command);
    expect(opts.onCommandRemoved).toHaveBeenCalledWith('c1');
    expect(opts.onLog).toHaveBeenCalledWith('warn', 'careful');
    expect(opts.onError).toHaveBeenCalledWith('boom');
  });

  it('ignores unknown message types', () => {
    const opts = options();
    const { instance } = create(opts);

    instance.emit({ __onda: { type: 'mystery' } });

    expect(opts.onError).not.toHaveBeenCalled();
  });

  it('resets the message budget after one second', () => {
    vi.useFakeTimers();
    const opts = options();
    const { instance } = create(opts);
    instance.emit({ __onda: { type: 'ready' } });

    for (let i = 0; i < 299; i++) {
      instance.emit({ __onda: { type: 'log', level: 'info', message: 'ok' } });
    }
    expect(instance.terminated).toBe(false);

    vi.advanceTimersByTime(1_000);

    for (let i = 0; i < 300; i++) {
      instance.emit({ __onda: { type: 'log', level: 'info', message: 'ok' } });
    }
    expect(opts.onError).not.toHaveBeenCalledWith('worker-message-rate-limit');

    instance.emit({ __onda: { type: 'log', level: 'info', message: 'ok' } });
    expect(opts.onError).toHaveBeenCalledWith('worker-message-rate-limit');
    expect(instance.terminated).toBe(true);
  });

  it('clears the heartbeat timer on pong', () => {
    vi.useFakeTimers();
    const opts = options();
    const { instance } = create(opts);
    instance.emit({ __onda: { type: 'ready' } });

    vi.advanceTimersByTime(PLUGIN_HEARTBEAT_INTERVAL_MS);
    instance.emit({ __onda: { type: 'pong' } });
    vi.advanceTimersByTime(PLUGIN_HEARTBEAT_TIMEOUT_MS);

    expect(opts.onError).not.toHaveBeenCalled();
  });

  it('accepts a pong without an outstanding heartbeat', () => {
    const opts = options();
    const { instance } = create(opts);
    instance.emit({ __onda: { type: 'ready' } });

    instance.emit({ __onda: { type: 'pong' } });

    expect(opts.onError).not.toHaveBeenCalled();
  });

  it('clears a pending heartbeat when terminated', () => {
    vi.useFakeTimers();
    const opts = options();
    const { handle, instance } = create(opts);
    instance.emit({ __onda: { type: 'ready' } });

    vi.advanceTimersByTime(PLUGIN_HEARTBEAT_INTERVAL_MS);
    handle.terminate();
    vi.advanceTimersByTime(PLUGIN_HEARTBEAT_TIMEOUT_MS);

    expect(instance.terminated).toBe(true);
    expect(opts.onError).not.toHaveBeenCalled();
  });

  it('terminates when a heartbeat check is still pending on the next tick', () => {
    vi.useFakeTimers();
    const opts = options();
    const { instance } = create(opts);
    instance.emit({ __onda: { type: 'ready' } });

    vi.advanceTimersByTime(PLUGIN_HEARTBEAT_INTERVAL_MS * 2);

    expect(opts.onError).toHaveBeenCalledWith('worker-heartbeat-timeout');
    expect(instance.terminated).toBe(true);
  });

  it('reports a heartbeat post failure', () => {
    vi.useFakeTimers();
    const opts = options();
    const { instance } = create(opts);
    instance.emit({ __onda: { type: 'ready' } });
    instance.postMessage = () => {
      throw new Error('closed');
    };

    vi.advanceTimersByTime(PLUGIN_HEARTBEAT_INTERVAL_MS);

    expect(opts.onError).toHaveBeenCalledWith('closed');
    expect(instance.terminated).toBe(true);
  });

  it('uses a fallback reason for non-Error heartbeat failures', () => {
    vi.useFakeTimers();
    const opts = options();
    const { instance } = create(opts);
    instance.emit({ __onda: { type: 'ready' } });
    instance.postMessage = () => {
      throw 'boom';
    };

    vi.advanceTimersByTime(PLUGIN_HEARTBEAT_INTERVAL_MS);

    expect(opts.onError).toHaveBeenCalledWith('worker-heartbeat-failed');
  });
});

describe('host api routing', () => {
  it('returns dispatched data to the worker', async () => {
    const apiDispatch = vi.fn().mockResolvedValue({ rows: 1 });
    const opts = options(apiDispatch);
    const { instance } = create(opts);
    instance.emit({ __onda: { type: 'ready' } });

    instance.emit({ __onda: { type: 'api-request', id: 3, op: 'query', args: ['a'] } });
    await flushMicrotasks();

    expect(apiDispatch).toHaveBeenCalledWith('query', ['a']);
    expect(instance.messages.at(-1)).toEqual({
      __onda: { type: 'api-response', id: 3, ok: true, data: { rows: 1 }, error: undefined }
    });
  });

  it('reports dispatch errors with the error message', async () => {
    const opts = options(vi.fn().mockRejectedValue(new Error('nope')));
    const { instance } = create(opts);
    instance.emit({ __onda: { type: 'ready' } });

    instance.emit({ __onda: { type: 'api-request', id: 4, op: 'action', args: [] } });
    await flushMicrotasks();

    expect(instance.messages.at(-1)).toEqual({
      __onda: { type: 'api-response', id: 4, ok: false, data: undefined, error: 'nope' }
    });
  });

  it('stringifies non-Error dispatch failures', async () => {
    const opts = options(vi.fn().mockRejectedValue('plain'));
    const { instance } = create(opts);
    instance.emit({ __onda: { type: 'ready' } });

    instance.emit({ __onda: { type: 'api-request', id: 5, op: 'action', args: [] } });
    await flushMicrotasks();

    expect(instance.messages.at(-1)).toMatchObject({
      __onda: { type: 'api-response', id: 5, ok: false, error: 'plain' }
    });
  });

  it('reports a failed api response post', async () => {
    const opts = options(vi.fn().mockResolvedValue('ok'));
    const { instance } = create(opts);
    instance.emit({ __onda: { type: 'ready' } });
    instance.postMessage = () => {
      throw new Error('closed');
    };

    instance.emit({ __onda: { type: 'api-request', id: 6, op: 'query', args: [] } });
    await flushMicrotasks();

    expect(opts.onError).toHaveBeenCalledWith('closed');
    expect(instance.messages).toHaveLength(0);
  });

  it('falls back when the api response post fails without an Error', async () => {
    const opts = options(vi.fn().mockResolvedValue('ok'));
    const { instance } = create(opts);
    instance.emit({ __onda: { type: 'ready' } });
    instance.postMessage = () => {
      throw 'nope';
    };

    instance.emit({ __onda: { type: 'api-request', id: 7, op: 'query', args: [] } });
    await flushMicrotasks();

    expect(opts.onError).toHaveBeenCalledWith('api-response-failed');
  });

  it('rejects the extra request when the concurrency limit response cannot be posted', () => {
    const opts = options(() => new Promise(() => {}));
    const { instance } = create(opts);
    instance.emit({ __onda: { type: 'ready' } });
    for (let id = 1; id <= 16; id++) {
      instance.emit({ __onda: { type: 'api-request', id, op: 'query', args: [] } });
    }
    instance.postMessage = () => {
      throw new Error('closed');
    };

    instance.emit({ __onda: { type: 'api-request', id: 17, op: 'query', args: [] } });

    expect(opts.onError).toHaveBeenCalledWith('closed');
    expect(instance.terminated).toBe(false);
  });

  it('falls back when the limit response fails without an Error', () => {
    const opts = options(() => new Promise(() => {}));
    const { instance } = create(opts);
    instance.emit({ __onda: { type: 'ready' } });
    for (let id = 1; id <= 16; id++) {
      instance.emit({ __onda: { type: 'api-request', id, op: 'query', args: [] } });
    }
    instance.postMessage = () => {
      throw 'nope';
    };

    instance.emit({ __onda: { type: 'api-request', id: 17, op: 'query', args: [] } });

    expect(opts.onError).toHaveBeenCalledWith('api-limit-response-failed');
  });
});

describe('outbound messages', () => {
  it('posts hooks and commands with an optional payload', () => {
    const opts = options();
    const { handle, instance } = create(opts);

    handle.postHook('track-changed', { id: 1 });
    handle.postInvokeCommand('play');
    handle.postInvokeCommand('seek', { time: 5 });

    expect(instance.messages).toEqual([
      { __onda: { type: 'hook', name: 'track-changed', payload: { id: 1 } } },
      { __onda: { type: 'invoke-command', commandId: 'play' } },
      { __onda: { type: 'invoke-command', commandId: 'seek', payload: { time: 5 } } }
    ]);
  });

  it('reports hook and command post failures', () => {
    const opts = options();
    const { handle, instance } = create(opts);
    instance.postMessage = () => {
      throw new Error('closed');
    };

    handle.postHook('track-changed', {});
    expect(opts.onError).toHaveBeenCalledWith('closed');

    handle.postInvokeCommand('play');
    expect(opts.onError).toHaveBeenCalledWith('closed');
  });

  it('uses fallback reasons for non-Error post failures', () => {
    const opts = options();
    const { handle, instance } = create(opts);
    instance.postMessage = () => {
      throw 'nope';
    };

    handle.postHook('track-changed', {});
    expect(opts.onError).toHaveBeenCalledWith('postHook-failed');

    handle.postInvokeCommand('play');
    expect(opts.onError).toHaveBeenCalledWith('invoke-command-failed');
  });

  it('reports worker script errors with a fallback', () => {
    const opts = options();
    const { instance } = create(opts);

    instance.onerror?.({ message: 'script failed' } as ErrorEvent);
    expect(opts.onError).toHaveBeenCalledWith('script failed');
    expect(instance.terminated).toBe(true);

    const secondOpts = options();
    const second = create(secondOpts);
    second.instance.onerror?.({ message: '' } as ErrorEvent);
    expect(second.instance.terminated).toBe(true);
    expect(secondOpts.onError).toHaveBeenCalledWith('worker-error');
  });

  it('terminates only once and releases the blob url', () => {
    const opts = options();
    const { handle, instance } = create(opts);

    handle.terminate();
    handle.terminate();

    expect(instance.terminated).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
