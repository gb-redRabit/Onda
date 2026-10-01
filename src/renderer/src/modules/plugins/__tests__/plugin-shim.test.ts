import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import {
  PLUGIN_API_SHIM,
  buildPluginWorkerCode,
  readWorkerMsg,
  readMainMsg,
  wrapIntoWorker
} from '../plugin-shim';

describe('plugin protocol helpers', () => {
  it('wrapIntoWorker/readWorkerMsg round-trip', () => {
    expect(readWorkerMsg(wrapIntoWorker({ type: 'ready' }))).toEqual({ type: 'ready' });
    expect(
      readWorkerMsg(wrapIntoWorker({ type: 'api-request', id: 3, op: 'query', args: ['x'] }))
    ).toEqual({
      type: 'api-request',
      id: 3,
      op: 'query',
      args: ['x']
    });
  });
  it('readWorkerMsg ignores foreign messages', () => {
    expect(readWorkerMsg(null)).toBeNull();
    expect(readWorkerMsg({})).toBeNull();
    expect(readWorkerMsg({ __onda: { nope: 1 } })).toBeNull();
  });
  it('readMainMsg decodes api-response', () => {
    expect(
      readMainMsg(wrapIntoWorker({ type: 'api-response', id: 5, ok: true, data: 42 }))
    ).toEqual({
      type: 'api-response',
      id: 5,
      ok: true,
      data: 42
    });
    expect(readMainMsg({ __onda: { type: 'hook', name: 'app:start', payload: {} } })).toEqual({
      type: 'hook',
      name: 'app:start',
      payload: {}
    });
  });
});

describe('PLUGIN_API_SHIM', () => {
  it('exposes the sandboxed api surface', () => {
    for (const needle of [
      'self.api = api',
      "post('ready', {})",
      'registerCommand',
      'storage:get',
      'storage:set',
      'api-request',
      'api-response',
      'invoke-command',
      'BLOCKED_GLOBALS',
      'MAX_ARGS_BYTES',
      'MAX_LOG_CHARS',
      'MAX_SLOT_ITEMS',
      'filterSlotItems'
    ]) {
      expect(PLUGIN_API_SHIM).toContain(needle);
    }
    expect(PLUGIN_API_SHIM).not.toContain('eval');
    expect(PLUGIN_API_SHIM).not.toContain('new Function');
  });

  it('buildPluginWorkerCode wraps plugin code in an IIFE', () => {
    const code = 'api.log.info("hi");';
    const full = buildPluginWorkerCode(code);
    expect(full).toContain('(function () {');
    expect(full).toContain(code);
    expect(full).toContain('})();');
  });
});

describe('PLUGIN_API_SHIM runtime', () => {
  type SandboxSelf = { api?: unknown; postMessage: (m: unknown) => void };

  function runShim(): {
    api: Record<string, unknown>;
    messages: unknown[];
    sandboxSelf: SandboxSelf;
  } {
    const messages: unknown[] = [];
    // Celowo prototyp null: shim wzmacnia `Object.getPrototypeOf(self)`,
    // a zwykły obiekt rozwiązywałby się do HOSTOWEGO Object.prototype wewnątrz vm.
    const sandboxSelf = Object.create(null) as SandboxSelf;
    sandboxSelf.postMessage = (m: unknown) => messages.push(m);
    const sandbox: Record<string, unknown> = {
      self: sandboxSelf,
      setTimeout: (fn: () => void) => fn()
    };
    vm.createContext(sandbox);
    vm.runInContext(PLUGIN_API_SHIM, sandbox);
    return { api: (sandboxSelf.api as Record<string, unknown>) || {}, messages, sandboxSelf };
  }

  it('blocks direct network globals that bypass the permission bridge', () => {
    const { sandboxSelf } = runShim();
    for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts']) {
      expect((sandboxSelf as unknown as Record<string, unknown>)[name]).toBeUndefined();
    }
  });

  it('truncates plugin log lines to MAX_LOG_CHARS', () => {
    const { api, messages } = runShim();
    const log = api.log as { info: (m: string) => void };
    log.info('x'.repeat(5000));
    const msg = readWorkerMsg(messages[messages.length - 1]);
    expect(msg).toMatchObject({ type: 'log', level: 'info' });
    expect((msg as { message: string }).message).toHaveLength(2000);
  });

  it('rejects oversized api request payloads', async () => {
    const { api, messages } = runShim();
    const before = messages.length;
    const query = api.query as (name: string, args: unknown) => Promise<unknown>;
    await expect(query('x', { blob: 'y'.repeat(200_000) })).rejects.toThrow(
      'plugin-op-args-too-large'
    );
    expect(messages.length).toBe(before);
  });

  it('keeps payloads inside the __onda envelope (worker -> main)', () => {
    const { api, messages } = runShim();
    const register = api.registerCommand as (cmd: unknown) => () => void;
    register({ id: 'hello:greet', label: 'Hello' });
    register({
      id: 'hello:bye',
      label: 'Bye',
      icon: 'X',
      location: 'audio-view',
      shortcut: 'Ctrl+Alt+T'
    });

    expect(readWorkerMsg(messages[0])).toEqual({ type: 'ready' });
    expect(readWorkerMsg(messages[1])).toEqual({
      type: 'register-command',
      command: { id: 'hello:greet', label: 'Hello', icon: undefined }
    });
    expect(readWorkerMsg(messages[2])).toEqual({
      type: 'register-command',
      command: {
        id: 'hello:bye',
        label: 'Bye',
        icon: 'X',
        location: 'audio-view',
        shortcut: 'Ctrl+Alt+T'
      }
    });
  });

  it('routes api.request payloads through the envelope', () => {
    const { api, messages } = runShim();
    void (api.query as (n: string, a: unknown) => Promise<unknown>)('player:status', {});
    const pending = messages[messages.length - 1];
    expect(readWorkerMsg(pending)).toMatchObject({
      type: 'api-request',
      op: 'query',
      args: ['player:status', {}]
    });
  });

  it('api.visual posts ui:set through the envelope', () => {
    const { api, messages } = runShim();
    void (api.visual as (k: string, v: unknown) => Promise<unknown>)('element.decoration', {
      element: 'cover',
      value: 'triangle'
    });
    const pending = messages[messages.length - 1];
    expect(readWorkerMsg(pending)).toMatchObject({
      type: 'api-request',
      op: 'ui:set',
      args: ['element.decoration', { element: 'cover', value: 'triangle' }]
    });
  });

  it('api.ui.set posts ui:slot and clamps the item list before it leaves the worker', () => {
    const { api, messages } = runShim();
    const ui = api.ui as { set: (slot: string, items: unknown) => Promise<unknown> };
    void ui.set('audio-view', [{ label: 'A', value: 'B' }]);
    expect(readWorkerMsg(messages[messages.length - 1])).toMatchObject({
      type: 'api-request',
      op: 'ui:slot',
      args: ['audio-view', [{ label: 'A', value: 'B' }]]
    });

    const many = Array.from({ length: 20 }, (_, i) => ({ label: `l${i}`, value: 'v' }));
    void ui.set('audio-view', many);
    const clamped = readWorkerMsg(messages[messages.length - 1]) as unknown as {
      args: [string, { label: string }[]];
    };
    expect(clamped.args[1]).toHaveLength(8);

    const long = [{ label: 'x'.repeat(500), value: 'y'.repeat(500) }];
    void ui.set('audio-view', long);
    const trimmed = readWorkerMsg(messages[messages.length - 1]) as unknown as {
      args: [string, { label: string; value: string }[]];
    };
    expect(trimmed.args[1][0].label).toHaveLength(160);
    expect(trimmed.args[1][0].value).toHaveLength(160);
  });

  it('api.ui.clear posts an empty list and non-arrays collapse to empty', () => {
    const { api, messages } = runShim();
    const ui = api.ui as {
      clear: (slot: string) => Promise<unknown>;
      set: (s: string, i: unknown) => Promise<unknown>;
    };
    void ui.clear('audio-view');
    expect(readWorkerMsg(messages[messages.length - 1])).toMatchObject({
      op: 'ui:slot',
      args: ['audio-view', []]
    });
    void ui.set('audio-view', 'not-a-list');
    expect(readWorkerMsg(messages[messages.length - 1])).toMatchObject({
      op: 'ui:slot',
      args: ['audio-view', []]
    });
  });

  it('api.settings posts settings ops through the envelope', () => {
    const { api, messages } = runShim();
    const settings = api.settings as {
      get: (k: string) => Promise<unknown>;
      set: (k: string, v: unknown) => Promise<unknown>;
    };
    void settings.get('shape');
    expect(readWorkerMsg(messages[messages.length - 1])).toMatchObject({
      op: 'settings:get',
      args: ['shape']
    });
    void settings.set('shape', 'hexagon');
    expect(readWorkerMsg(messages[messages.length - 1])).toMatchObject({
      op: 'settings:set',
      args: ['shape', 'hexagon']
    });
  });
});
