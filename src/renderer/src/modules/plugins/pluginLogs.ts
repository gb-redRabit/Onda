import type { Ref } from 'vue';

const MAX_LOG_LINES = 50;

// Bounded per-plugin log ring buffer extracted from `stores/plugins.ts` (plan 2.8).
export function createPluginLogs(logs: Ref<Record<string, string[]>>) {
  function logPush(id: string, line: string): void {
    let list = logs.value[id];
    if (!list) {
      list = [];
      logs.value = { ...logs.value, [id]: list };
    }
    list.push(line);
    if (list.length > MAX_LOG_LINES) list.splice(0, list.length - MAX_LOG_LINES);
  }

  return { logPush };
}
