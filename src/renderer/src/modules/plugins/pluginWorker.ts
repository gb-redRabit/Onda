import type {
  PluginCommandEntry,
  PluginHookPayload,
  PluginWorkerMsg,
  PluginMainMsg
} from './pluginShim';
import { buildPluginWorkerCode, wrapIntoWorker, readWorkerMsg } from './pluginShim';

export const PLUGIN_READY_TIMEOUT_MS = 10_000;
export const PLUGIN_MAX_PENDING_API_REQUESTS = 16;
export const PLUGIN_MAX_MESSAGES_PER_SECOND = 300;
export const PLUGIN_HEARTBEAT_INTERVAL_MS = 15_000;
export const PLUGIN_HEARTBEAT_TIMEOUT_MS = 10_000;
export const PLUGIN_MAX_MESSAGE_CHARS = 100_000;

function serializedSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function capped(value: unknown, max = 2000): string {
  return String(value ?? '').slice(0, max);
}

export interface PluginWorkerOptions {
  id: string;
  code: string;
  onReady: () => void;
  onCommand: (command: PluginCommandEntry) => void;
  onCommandRemoved: (commandId: string) => void;
  onLog: (level: 'info' | 'warn' | 'error', message: string) => void;
  onError: (message: string) => void;
  apiDispatch: (op: string, args: unknown[]) => Promise<unknown>;
}

export interface PluginWorkerHandle {
  postHook: (name: string, payload: PluginHookPayload) => void;
  postInvokeCommand: (commandId: string, payload?: PluginHookPayload) => void;
  terminate: () => void;
}

export function createPluginWorker(opts: PluginWorkerOptions): PluginWorkerHandle {
  const workerCode = buildPluginWorkerCode(opts.code);
  const blob = new Blob([workerCode], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  const pendingApiRequests = new Set<number>();
  let terminated = false;
  let ready = false;
  let messageWindowStart = Date.now();
  let messagesInWindow = 0;
  let readyTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

  function terminateWorker(): void {
    if (terminated) return;
    terminated = true;
    if (readyTimer) clearTimeout(readyTimer);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    URL.revokeObjectURL(url);
  }

  function withinMessageBudget(): boolean {
    const now = Date.now();
    if (now - messageWindowStart >= 1000) {
      messageWindowStart = now;
      messagesInWindow = 0;
    }
    messagesInWindow++;
    return messagesInWindow <= PLUGIN_MAX_MESSAGES_PER_SECOND;
  }

  worker.onmessage = (e: MessageEvent) => {
    if (!withinMessageBudget()) {
      opts.onError('worker-message-rate-limit');
      terminateWorker();
      return;
    }
    const msg = readWorkerMsg(e.data);
    if (!msg) return;
    void handleWorkerMsg(msg, opts);
  };

  worker.onerror = (e: ErrorEvent) => {
    opts.onError(e.message || 'worker-error');
    terminateWorker();
  };

  // `ready` i `terminateWorker` czyszczą ten timer, więc callback nie może
  // zastać stanu gotowości ani zakończenia.
  readyTimer = setTimeout(() => {
    opts.onError('worker-ready-timeout');
    terminateWorker();
  }, PLUGIN_READY_TIMEOUT_MS);

  function handleWorkerMsg(msg: PluginWorkerMsg, o: PluginWorkerOptions): Promise<void> {
    switch (msg.type) {
      case 'ready':
        if (ready) return Promise.resolve();
        ready = true;
        if (readyTimer) clearTimeout(readyTimer);
        readyTimer = null;
        o.onReady();
        heartbeatInterval = setInterval(() => {
          // Timeout (10 s) zawsze wygasa przed kolejnym tickiem (15 s), a `pong`
          // i terminate czyszczą timer — więc nie ma tu zaległego `heartbeatTimer`.
          try {
            worker.postMessage(wrapIntoWorker({ type: 'ping' }));
            heartbeatTimer = setTimeout(() => {
              heartbeatTimer = null;
              o.onError('worker-heartbeat-timeout');
              terminateWorker();
            }, PLUGIN_HEARTBEAT_TIMEOUT_MS);
          } catch (e) {
            o.onError(e instanceof Error ? e.message : 'worker-heartbeat-failed');
            terminateWorker();
          }
        }, PLUGIN_HEARTBEAT_INTERVAL_MS);
        return Promise.resolve();
      case 'pong':
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        heartbeatTimer = null;
        return Promise.resolve();
      case 'register-command':
        o.onCommand({
          ...msg.command,
          id: capped(msg.command?.id, 128),
          label: capped(msg.command?.label, 200),
          icon: typeof msg.command?.icon === 'string' ? capped(msg.command.icon, 200) : undefined,
          location:
            typeof msg.command?.location === 'string'
              ? capped(msg.command.location, 64)
              : undefined,
          shortcut:
            typeof msg.command?.shortcut === 'string' ? capped(msg.command.shortcut, 32) : undefined
        });
        return Promise.resolve();
      case 'unregister-command':
        o.onCommandRemoved(capped(msg.commandId, 128));
        return Promise.resolve();
      case 'log':
        o.onLog(msg.level, capped(msg.message, PLUGIN_MAX_MESSAGE_CHARS));
        return Promise.resolve();
      case 'error':
        o.onError(capped(msg.message, PLUGIN_MAX_MESSAGE_CHARS));
        return Promise.resolve();
      case 'api-request': {
        // Shim sprawdza rozmiar tylko w `api.call`; plugin może wywołać
        // `self.postMessage` bezpośrednio, więc host musi powtórzyć limit.
        if (!Array.isArray(msg.args) || serializedSize(msg.args) > PLUGIN_MAX_MESSAGE_CHARS) {
          try {
            worker.postMessage(
              wrapIntoWorker({
                type: 'api-response',
                id: msg.id,
                ok: false,
                error: 'plugin-api-args-too-large'
              })
            );
          } catch (e) {
            o.onError(e instanceof Error ? e.message : 'api-limit-response-failed');
          }
          return Promise.resolve();
        }
        if (pendingApiRequests.size >= PLUGIN_MAX_PENDING_API_REQUESTS) {
          try {
            worker.postMessage(
              wrapIntoWorker({
                type: 'api-response',
                id: msg.id,
                ok: false,
                error: 'plugin-api-concurrency-limit'
              })
            );
          } catch (e) {
            o.onError(e instanceof Error ? e.message : 'api-limit-response-failed');
          }
          return Promise.resolve();
        }
        pendingApiRequests.add(msg.id);
        return routeApiRequest(worker, msg.id, msg.op, msg.args, o).finally(() =>
          pendingApiRequests.delete(msg.id)
        );
      }
      default:
        return Promise.resolve();
    }
  }

  return {
    postHook(name: string, payload: PluginHookPayload): void {
      const msg: PluginMainMsg = { type: 'hook', name, payload };
      try {
        worker.postMessage(wrapIntoWorker(msg));
      } catch (e) {
        opts.onError(e instanceof Error ? e.message : 'postHook-failed');
      }
    },
    postInvokeCommand(commandId: string, payload?: PluginHookPayload): void {
      const msg: PluginMainMsg = {
        type: 'invoke-command',
        commandId,
        ...(payload ? { payload } : {})
      };
      try {
        worker.postMessage(wrapIntoWorker(msg));
      } catch (e) {
        opts.onError(e instanceof Error ? e.message : 'invoke-command-failed');
      }
    },
    terminate(): void {
      terminateWorker();
    }
  };
}

async function routeApiRequest(
  worker: Worker,
  reqId: number,
  op: string,
  args: unknown[],
  o: PluginWorkerOptions
): Promise<void> {
  let ok = true;
  let data: unknown;
  let error: string | undefined;
  try {
    data = await o.apiDispatch(op, args);
  } catch (e) {
    ok = false;
    error = e instanceof Error ? e.message : String(e);
  }
  const msg: PluginMainMsg = { type: 'api-response', id: reqId, ok, data, error };
  try {
    worker.postMessage(wrapIntoWorker(msg));
  } catch (e) {
    o.onError(e instanceof Error ? e.message : 'api-response-failed');
  }
}
