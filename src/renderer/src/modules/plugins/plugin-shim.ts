export interface PluginHookPayload {
  [key: string]: unknown;
}

export interface PluginCommandEntry {
  id: string;
  label: string;
  icon?: string;
  location?: string;
  shortcut?: string;
}

export type PluginWorkerMsg =
  | { type: 'ready' }
  | { type: 'api-request'; id: number; op: string; args: unknown[] }
  | { type: 'register-command'; command: PluginCommandEntry }
  | { type: 'unregister-command'; commandId: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'error'; message: string };

export type PluginMainMsg =
  | { type: 'hook'; name: string; payload: PluginHookPayload }
  | { type: 'api-response'; id: number; ok: boolean; data?: unknown; error?: string }
  | { type: 'invoke-command'; commandId: string; payload?: PluginHookPayload };

export interface PluginEnvelope<T> {
  __onda: T;
}

export function wrapIntoWorker<T>(msg: T): PluginEnvelope<T> {
  return { __onda: msg };
}

export function readWorkerMsg(data: unknown): PluginWorkerMsg | null {
  const o = data as { __onda?: PluginWorkerMsg } | null;
  if (!o || typeof o !== 'object' || !o.__onda || typeof o.__onda.type !== 'string') return null;
  return o.__onda;
}

export function readMainMsg(data: unknown): PluginMainMsg | null {
  const o = data as { __onda?: PluginMainMsg } | null;
  if (!o || typeof o !== 'object' || !o.__onda || typeof o.__onda.type !== 'string') return null;
  return o.__onda;
}

export const PLUGIN_API_SHIM = [
  '(function(){',
  "  'use strict';",
  '  var pending = Object.create(null);',
  '  var nextReq = 1;',
  '  var MAX_WAIT = 45000;',
  '  function post(type, payload) {',
  '    try { self.postMessage({ __onda: Object.assign({ type: type }, payload || {}) }); } catch (e) { /* ignore */ }',
  '  }',
  '  function call(op, args) {',
  '    return new Promise(function (resolve, reject) {',
  '      var id = nextReq++;',
  '      var timer = setTimeout(function () {',
  '        if (!pending[id]) return;',
  '        delete pending[id];',
  '        reject(new Error(\'plugin-op-timeout\'));',
  '      }, MAX_WAIT);',
  "      pending[id] = { resolve: resolve, reject: reject, timer: timer };",
  "      post('api-request', { id: id, op: op, args: args });",
  '    });',
  '  }',
  '  function safeReport(err) {',
  '    var m = String(err && err.message ? err.message : err);',
  '    post(\'error\', { message: m.slice(0, 1000) });',
  '  }',
  '  var hooks = Object.create(null);',
  '  var commands = Object.create(null);',
  '  var api = {',
  '    on: function (name, cb) { if (typeof name === \'string\' && typeof cb === \'function\') hooks[name] = cb; },',
  "    off: function (name) { delete hooks[name]; },",
  '    query: function (name, args) { return call(\'query\', [name, args || {}]); },',
  '    action: function (name, args) { return call(\'action\', [name, args || {}]); },',
  '    notify: function (opts) { return call(\'action\', [\'notify\', opts || {}]); },',
  '    storage: {',
  '      keys: function () { return call(\'storage:keys\', []); },',
  '      get: function (key) { return call(\'storage:get\', [key]); },',
  '      set: function (key, value) { return call(\'storage:set\', [key, value]); },',
  '      remove: function (key) { return call(\'storage:remove\', [key]); }',
  '    },',
  '    settings: {',
  "      get: function (key) { return call('settings:get', [key]); },",
  "      set: function (key, value) { return call('settings:set', [key, value]); }",
  '    },',
  '    fetch: function (url, opts) { return call(\'fetch\', [url, opts || {}]); },',
  "    visual: function (key, value) { return call('ui:set', [key, value || '']); },",
  "    registerCommand: function (cmd) {",
  "      if (!cmd || typeof cmd.id !== 'string' || typeof cmd.label !== 'string') return function () {};",
  "      var entry = { id: cmd.id, label: cmd.label, icon: typeof cmd.icon === 'string' ? cmd.icon : undefined };",
  "      if (typeof cmd.location === 'string' && cmd.location.length <= 64) entry.location = cmd.location;",
  "      if (typeof cmd.shortcut === 'string' && cmd.shortcut.length <= 32) entry.shortcut = cmd.shortcut;",
  '      commands[cmd.id] = typeof cmd.action === \'function\' ? cmd.action : null;',
  "      post('register-command', { command: entry });",
  '      return function () {',
  '        delete commands[cmd.id];',
  "        post('unregister-command', { commandId: cmd.id });",
  '      };',
  '    },',
  '    log: {',
  "      info: function (m) { post('log', { level: 'info', message: String(m) }); },",
  "      warn: function (m) { post('log', { level: 'warn', message: String(m) }); },",
  "      error: function (m) { post('log', { level: 'error', message: String(m) }); }",
  '    }',
  '  };',
  '  self.api = api;',
  "  var pendingHook = null;",
  '  self.onmessage = function (e) {',
  '    var o = e && e.data && e.data.__onda;',
  '    if (!o) return;',
  "    if (o.type === 'api-response') {",
  '      var p = pending[o.id];',
  '      if (!p) return;',
  '      delete pending[o.id];',
  '      clearTimeout(p.timer);',
  '      if (o.ok) { p.resolve(o.data); } else { p.reject(new Error(o.error || \'plugin-op-failed\')); }',
  "    } else if (o.type === 'hook') {",
  '      var cb = hooks[o.name];',
  '      if (cb) { try { cb(o.payload || {}); } catch (err) { safeReport(err); } }',
  "    } else if (o.type === 'invoke-command') {",
  '      var fn = commands[o.commandId];',
  '      if (fn) { try { fn(o.payload || {}); } catch (err) { safeReport(err); } }',
  '    }',
  '  };',
  "  post('ready', {});",
  '  return api;',
  '})();'
].join('\n');

export function buildPluginWorkerCode(pluginCode: string): string {
  return PLUGIN_API_SHIM + '\n;(function () {\n' + pluginCode + '\n})();\n';
}