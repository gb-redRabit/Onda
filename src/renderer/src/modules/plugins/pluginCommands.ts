import type { Ref, ShallowRef } from 'vue';
import type { PluginCommandEntry, PluginHookPayload } from './plugin-shim';
import type { PluginWorkerHandle } from './pluginWorker';
import { isKnownHook } from '@renderer/utils/pluginHooks';

export interface PluginCommandsDeps {
  commands: Ref<PluginCommandEntry[]>;
  workers: ShallowRef<Record<string, PluginWorkerHandle>>;
  readyWorkers: Set<string>;
  logPush: (id: string, line: string) => void;
}

// Hook/command dispatch onto spawned plugin workers, extracted from
// `stores/plugins.ts` (plan 2.8).
export function createPluginCommands(deps: PluginCommandsDeps) {
  const { commands, workers, readyWorkers, logPush } = deps;

  function emitHook(name: string, payload: PluginHookPayload): void {
    if (!isKnownHook(name)) return;
    const list = Object.entries(workers.value);
    for (const [id, handle] of list) {
      if (!readyWorkers.has(id)) continue;
      try {
        handle.postHook(name, payload);
      } catch (e) {
        logPush(id, `[error] hook ${name} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  function commandsIn(location: string): PluginCommandEntry[] {
    return commands.value.filter((c) => (c as { location?: string }).location === location);
  }

  function findCommandByShortcut(
    shortcut: string
  ): (PluginCommandEntry & { pluginId?: string }) | undefined {
    return commands.value.find((c) => c.shortcut === shortcut);
  }

  function dispatchShortcut(shortcut: string): boolean {
    const cmd = findCommandByShortcut(shortcut);
    if (!cmd) return false;
    dispatchCommand(cmd.id);
    return true;
  }

  function dispatchCommand(commandId: string, payload?: PluginHookPayload): void {
    const cmd = commands.value.find((c) => c.id === commandId) as
      (PluginCommandEntry & { pluginId?: string }) | undefined;
    if (!cmd || !cmd.pluginId) return;
    const handle = workers.value[cmd.pluginId];
    if (!handle || !readyWorkers.has(cmd.pluginId)) return;
    try {
      handle.postInvokeCommand(commandId, payload);
    } catch (e) {
      logPush(
        cmd.pluginId,
        `[error] invoke-command failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  function invokeCommandWithContext(commandId: string, payload: PluginHookPayload): void {
    dispatchCommand(commandId, payload);
  }

  return { emitHook, commandsIn, dispatchShortcut, dispatchCommand, invokeCommandWithContext };
}
