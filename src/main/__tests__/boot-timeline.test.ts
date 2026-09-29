import { describe, it, expect, vi, beforeEach } from 'vitest';

const metricsMock = vi.hoisted(() => vi.fn(() => [] as unknown[]));
vi.mock('electron', () => ({ app: { getAppMetrics: metricsMock } }));

import { getBootPhases, getPerfSnapshot, markBootPhase, markBootStart } from '../boot-timeline';

beforeEach(() => {
  metricsMock.mockReset();
  metricsMock.mockReturnValue([]);
  markBootStart();
});

describe('boot timeline', () => {
  it('records phases in order with non-decreasing offsets', () => {
    markBootPhase('boot start');
    markBootPhase('settings ready');
    const phases = getBootPhases();
    expect(phases.map((p) => p.label)).toEqual(['boot start', 'settings ready']);
    expect(phases[0].ms).toBeGreaterThanOrEqual(0);
    expect(phases[1].ms).toBeGreaterThanOrEqual(phases[0].ms);
  });

  it('returns a copy and resets on markBootStart', () => {
    markBootPhase('a');
    const copy = getBootPhases();
    copy.push({ label: 'injected', ms: 1 });
    expect(getBootPhases().map((p) => p.label)).toEqual(['a']);

    markBootStart();
    expect(getBootPhases()).toEqual([]);
  });

  it('snapshots process metrics (KB → MB, CPU rounding)', () => {
    metricsMock.mockReturnValue([
      { type: 'Browser', memory: { workingSetSize: 262144 }, cpu: { percentCPUUsage: 1.234 } },
      { type: 'GPU', memory: {}, cpu: {} }
    ]);
    const snap = getPerfSnapshot();
    expect(snap.processes).toEqual([
      { type: 'Browser', workingSetMb: 256, cpuPercent: 1.2 },
      { type: 'GPU', workingSetMb: 0, cpuPercent: 0 }
    ]);
    expect(snap.mainRssMb).toBeGreaterThan(0);
  });
});
