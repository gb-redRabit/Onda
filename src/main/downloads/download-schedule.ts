import { hold } from './download-state';
import { pump } from './download-runner';

// Scheduled-start control extracted from `download-manager.ts` (plan 2.8).

let holdTimer: ReturnType<typeof setTimeout> | null = null;

function clearHoldTimer(): void {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

export function scheduleDownloadStart(timestamp: number | null): boolean {
  clearHoldTimer();
  if (timestamp == null) {
    hold.until = 0;
    void pump();
    return true;
  }
  const delay = timestamp - Date.now();
  if (delay <= 0) {
    hold.until = 0;
    void pump();
    return true;
  }
  hold.until = timestamp;
  holdTimer = setTimeout(() => {
    holdTimer = null;
    hold.until = 0;
    void pump();
  }, delay);
  return true;
}

export function getScheduledStart(): number | null {
  return hold.until || null;
}
