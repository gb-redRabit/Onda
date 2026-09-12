import type {
  PluginCommandEntry,
  PluginHookPayload,
  PluginWorkerMsg,
  PluginMainMsg
} from './plugin-shim';
import { buildPluginWorkerCode, wrapIntoWorker, readWorkerMsg } from './plugin-shim';

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

  worker.onmessage = (e: MessageEvent) => {
    const msg = readWorkerMsg(e.data);
    if (!msg) return;
    void handleWorkerMsg(msg, opts);
  };

  worker.onerror = (e: ErrorEvent) => {
    opts.onError(e.message || 'worker-error');
  };

  function handleWorkerMsg(msg: PluginWorkerMsg, o: PluginWorkerOptions): Promise<void> {
    switch (msg.type) {
      case 'ready':
        o.onReady();
        return Promise.resolve();
      case 'register-command':
        o.onCommand(msg.command);
        return Promise.resolve();
      case 'unregister-command':
        o.onCommandRemoved(msg.commandId);
        return Promise.resolve();
      case 'log':
        o.onLog(msg.level, msg.message);
        return Promise.resolve();
      case 'error':
        o.onError(msg.message);
        return Promise.resolve();
      case 'api-request':
        return routeApiRequest(worker, msg.id, msg.op, msg.args, o);
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
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      URL.revokeObjectURL(url);
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
