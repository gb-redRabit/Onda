import { describe, expect, it } from 'vitest';
import { buildDependencyIssues } from '../dependencyStatus';
import type { DependencyStatusEntry } from '../dependencyStatus';
import type { DepToolStatus } from '@shared/types/ipc';

function status(over: Partial<DepToolStatus> = {}): DepToolStatus {
  return {
    installed: true,
    version: '7.1',
    path: '/usr/bin/ffmpeg',
    managed: false,
    source: 'system',
    broken: false,
    error: null,
    ...over
  };
}

const missing: DepToolStatus = status({ installed: false, version: null, path: null });
const broken: DepToolStatus = status({ broken: true, error: 'spawn EACCES' });

function entry(
  tool: DependencyStatusEntry['tool'],
  name: string,
  st: DepToolStatus
): DependencyStatusEntry {
  return { tool, name, status: st };
}

describe('buildDependencyIssues', () => {
  it('reports nothing when every dependency is installed', () => {
    const issues = buildDependencyIssues([
      entry('ffmpeg', 'FFmpeg', status()),
      entry('ffprobe', 'FFprobe', status()),
      entry('yt-dlp', 'yt-dlp', status()),
      entry('mkvextract', 'MKVToolbox', status())
    ]);

    expect(issues).toEqual([]);
  });

  it('reports missing tools with their required flag', () => {
    const issues = buildDependencyIssues([
      entry('ffmpeg', 'FFmpeg', status()),
      entry('ffprobe', 'FFprobe', missing),
      entry('yt-dlp', 'yt-dlp', missing),
      entry('mkvextract', 'MKVToolbox', status())
    ]);

    expect(issues).toEqual([
      { tool: 'ffprobe', name: 'FFprobe', required: true, broken: false },
      { tool: 'yt-dlp', name: 'yt-dlp', required: false, broken: false }
    ]);
  });

  it('sorts required tools before optional ones', () => {
    const issues = buildDependencyIssues([
      entry('yt-dlp', 'yt-dlp', missing),
      entry('mkvextract', 'MKVToolbox', missing),
      entry('ffmpeg', 'FFmpeg', missing)
    ]);

    expect(issues.map((i) => i.tool)).toEqual(['ffmpeg', 'yt-dlp', 'mkvextract']);
  });

  it('treats an installed but broken tool as an issue', () => {
    const issues = buildDependencyIssues([
      entry('ffmpeg', 'FFmpeg', broken),
      entry('ffprobe', 'FFprobe', status())
    ]);

    expect(issues).toEqual([{ tool: 'ffmpeg', name: 'FFmpeg', required: true, broken: true }]);
  });

  it('does not mark a missing tool as broken', () => {
    const issues = buildDependencyIssues([entry('ffmpeg', 'FFmpeg', missing)]);

    expect(issues[0].broken).toBe(false);
  });
});
