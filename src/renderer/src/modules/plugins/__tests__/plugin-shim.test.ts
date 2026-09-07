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
    expect(readWorkerMsg(wrapIntoWorker({ type: 'api-request', id: 3, op: 'query', args: ['x'] }))).toEqual({
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
    expect(readMainMsg(wrapIntoWorker({ type: 'api-response', id: 5, ok: true, data: 42 }))).toEqual({
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
      'post(\'ready\', {})',
      'registerCommand',
      'storage:get',
      'storage:set',
      'api-request',
      'api-response',
      'invoke-command'
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
  function runShim(): { api: Record<string, unknown>; messages: unknown[] } {
    const messages: unknown[] = [];
    const sandboxSelf: { api?: unknown; postMessage: (m: unknown) => void } = {
      api: undefined,
      postMessage: (m: unknown) => messages.push(m)
    };
    const sandbox: Record<string, unknown> = {
      self: sandboxSelf,
      setTimeout: (fn: () => void) => fn()
    };
    vm.createContext(sandbox);
    vm.runInContext(PLUGIN_API_SHIM, sandbox);
    return { api: (sandboxSelf.api as Record<string, unknown>) || {}, messages };
  }

  it('keeps payloads inside the __onda envelope (worker -> main)', () => {
    const { api, messages } = runShim();
    const register = api.registerCommand as (cmd: unknown) => () => void;
    register({ id: 'hello:greet', label: 'Hello' });
    register({ id: 'hello:bye', label: 'Bye', icon: 'X', location: 'audio-view', shortcut: 'Ctrl+Alt+T' });

    expect(readWorkerMsg(messages[0])).toEqual({ type: 'ready' });
    expect(readWorkerMsg(messages[1])).toEqual({
      type: 'register-command',
      command: { id: 'hello:greet', label: 'Hello', icon: undefined }
    });
    expect(readWorkerMsg(messages[2])).toEqual({
      type: 'register-command',
      command: { id: 'hello:bye', label: 'Bye', icon: 'X', location: 'audio-view', shortcut: 'Ctrl+Alt+T' }
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

  it('api.settings posts settings ops through the envelope', () => {
    const { api, messages } = runShim();
    const settings = api.settings as { get: (k: string) => Promise<unknown>; set: (k: string, v: unknown) => Promise<unknown> };
    void settings.get('shape');
    expect(readWorkerMsg(messages[messages.length - 1])).toMatchObject({ op: 'settings:get', args: ['shape'] });
    void settings.set('shape', 'hexagon');
    expect(readWorkerMsg(messages[messages.length - 1])).toMatchObject({
      op: 'settings:set',
      args: ['shape', 'hexagon']
    });
  });
});