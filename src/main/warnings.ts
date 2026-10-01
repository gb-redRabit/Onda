import type { IpcWarningEntry } from '../shared/types/ipc/channels-system';

// Bufor pierścieniowy najnowszych ostrzeżeń procesu głównego (plan 5.3). Identyczne
// ostrzeżenia powtarzane w obrębie RATE_WINDOW_MS scalają się w jeden wpis z licznikiem,
// dzięki czemu hałaśliwa pętla nie wypycha reszty z bufora. Działa wyłącznie lokalnie:
// nic nie opuszcza komputera; eksportowany log pozostaje jedyną ścieżką udostępniania.

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
