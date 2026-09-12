import type { PluginHookPayload } from '@renderer/modules/plugins/plugin-shim';

export type PluginHookName =
  | 'app:start'
  | 'track:play'
  | 'track:end'
  | 'track:queued'
  | 'library:scan'
  | 'download:start'
  | 'download:complete'
  | 'download:error';

const KNOWN_HOOKS = new Set<PluginHookName>([
  'app:start',
  'track:play',
  'track:end',
  'track:queued',
  'library:scan',
  'download:start',
  'download:complete',
  'download:error'
]);

type HookListener = (payload: PluginHookPayload) => void;

class PluginHookBus {
  private listeners = new Map<PluginHookName, Set<HookListener>>();

  on(name: PluginHookName, fn: HookListener): () => void {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, new Set());
    }
    this.listeners.get(name)!.add(fn);
    return () => this.listeners.get(name)?.delete(fn);
  }

  emit(name: PluginHookName, payload: PluginHookPayload = {}): void {
    if (!KNOWN_HOOKS.has(name)) return;
    this.listeners.get(name)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.warn('[Onda/plugins] hook listener threw', name, e);
      }
    });
  }

  off(name: PluginHookName, fn: HookListener): void {
    this.listeners.get(name)?.delete(fn);
  }
}

export const pluginHookBus = new PluginHookBus();
export function isKnownHook(name: string): name is PluginHookName {
  return KNOWN_HOOKS.has(name as PluginHookName);
}
