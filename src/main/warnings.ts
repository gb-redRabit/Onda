import type { IpcWarningEntry } from '../shared/types/ipc/channels-system';

// Ring buffer of the most recent main-process warnings (plan 5.3). Identical
// warnings repeated within RATE_WINDOW_MS collapse into one entry with a count,
// so a noisy loop cannot push everything else out of the buffer. Purely local:
// nothing leaves the machine; the exported log remains the only sharing path.

const MAX_ENTRIES = 20;
const RATE_WINDOW_MS = 10_000;

const entries: IpcWarningEntry[] = [];

export function recordWarning(text: string, at: number = Date.now()): void {
  const last = entries[entries.length - 1];
  if (last && last.text === text && at - last.at <= RATE_WINDOW_MS) {
    last.count += 1;
    last.at = at;
    return;
  }
  entries.push({ at, text, count: 1 });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

export function getRecentWarnings(): IpcWarningEntry[] {
  return entries.slice();
}

export function clearWarnings(): void {
  entries.length = 0;
}
