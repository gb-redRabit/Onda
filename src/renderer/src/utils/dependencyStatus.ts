import type { DepToolStatus } from '@shared/types/ipc';

export type DepToolName = 'ffmpeg' | 'ffprobe' | 'yt-dlp' | 'mkvextract';

// Tools Onda cannot work correctly without: FFmpeg does every transcode, frame
// extraction and stream remux, FFprobe every duration / subtitle probe. yt-dlp
// and mkvextract only drive online downloads and MKV font extraction, so a
// missing one is reported as an optional issue (same "missing vs required"
// split the dependency resolver uses at runtime).
const REQUIRED_TOOLS: readonly DepToolName[] = ['ffmpeg', 'ffprobe'];

export interface DependencyStatusEntry {
  tool: DepToolName;
  name: string;
  status: DepToolStatus;
}

export interface DependencyIssue {
  tool: DepToolName;
  name: string;
  /** Missing/broken tool the app needs for basic playback features. */
  required: boolean;
  /** Present but the version probe failed (resolver marks it "broken"). */
  broken: boolean;
}

// Missing or broken dependencies, required ones first (stable within a group).
export function buildDependencyIssues(
  entries: readonly DependencyStatusEntry[]
): DependencyIssue[] {
  return entries
    .filter((entry) => !entry.status.installed || entry.status.broken)
    .map((entry) => ({
      tool: entry.tool,
      name: entry.name,
      required: REQUIRED_TOOLS.includes(entry.tool),
      broken: entry.status.installed && entry.status.broken
    }))
    .sort((a, b) => Number(b.required) - Number(a.required));
}
