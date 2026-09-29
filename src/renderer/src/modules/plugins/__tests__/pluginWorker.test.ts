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

beforeEach(() => {
  TestWorker.latest = null;
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
