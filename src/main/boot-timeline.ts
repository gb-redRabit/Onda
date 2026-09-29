import { app } from 'electron';

// Boot timeline + runtime snapshot for the Diagnostics "Performance" card.
// `markBootStart()` is called at the very beginning of `app.whenReady()` and
// every `markBootPhase()` adds a labelled offset, so users (and CI regression
// checks) can see where startup time goes without attaching a profiler.

export interface BootPhase {
  label: string;
  ms: number;
}

export interface PerfProcess {
  type: string;
  workingSetMb: number;
  cpuPercent: number;
}

export interface PerfSnapshot {
  phases: BootPhase[];
  mainRssMb: number;
  processes: PerfProcess[];
}

let startedAt = 0;
const phases: BootPhase[] = [];

export function markBootStart(): void {
  startedAt = performance.now();
  phases.length = 0;
}

/** Records `label` at the current offset and returns that offset in ms. */
export function markBootPhase(label: string): number {
  const ms = Math.round(performance.now() - startedAt);
  phases.push({ label, ms });
  return ms;
}

export function getBootPhases(): BootPhase[] {
  return [...phases];
}

export function getPerfSnapshot(): PerfSnapshot {
  return {
    phases: getBootPhases(),
    mainRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    processes: app.getAppMetrics().map((metric) => ({
      type: metric.type,
      workingSetMb: Math.round((metric.memory?.workingSetSize ?? 0) / 1024),
      cpuPercent: Math.round((metric.cpu?.percentCPUUsage ?? 0) * 10) / 10
    }))
  };
}
