import { app } from 'electron';

// Oś czasu startu + migawka runtime dla karty "Wydajność" w Diagnostyce.
// `markBootStart()` jest wywoływane na samym początku `app.whenReady()`, a
// każde `markBootPhase()` dodaje oznaczony offset, dzięki czemu użytkownicy (i
// testy regresji CI) widzą, gdzie znika czas startu, bez podłączania profilera.

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

/** Zapisuje `label` pod bieżącym offsetem i zwraca ten offset w ms. */
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
