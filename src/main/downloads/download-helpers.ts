import { app } from 'electron';
import { extname } from 'path';
import type { ChildProcess } from 'child_process';
import type { IpcDownloadTask } from '../../shared/types/ipc';
import { AUDIO_EXTS } from '../../shared/constants';
import { resolveFolderTokens } from './cover-spec';
import { sanitizeFilenameSpaced } from '../../shared/text';

// Czyste helpery wyodrębnione z `download-manager.ts` (plan 2.8) — bez stanu kolejki.

export interface Job extends IpcDownloadTask {
  child?: ChildProcess;
}

export function mapFilenameTemplate(template: string): string {
  const tokens: Record<string, string> = {
    '{title}': '%(title)s',
    '{artist}': '%(artist,uploader,channel)s',
    '{album}': '%(album)s',
    '{year}': '%(release_year)s',
    '{id}': '%(id)s'
  };
  let out = template.replace(/\s*[\\/:*?"<>|]\s*/g, ' ');
  for (const [key, value] of Object.entries(tokens)) {
    out = out.split(key).join(value);
  }
  return out.trim() || '%(title)s';
}

export function parseYtDlpProgress(
  line: string
): { progress?: number; speed?: string; eta?: string; destination?: string } | null {
  const dest = line.match(/\[(?:download|ExtractAudio|Merger)\] Destination: (.+)/);
  if (dest) return { destination: dest[1].trim() };
  const pct = line.match(/\[download\]\s+([\d.]+)%/);
  if (!pct) return null;
  const speed = line.match(/\bat\s+([\d.]+[A-Za-z]+\/s)\b/);
  const eta = line.match(/\bETA\s+(\S+)/);
  const progress = Math.min(100, Math.max(0, parseFloat(pct[1])));
  return {
    progress,
    ...(speed ? { speed: speed[1] } : {}),
    ...(eta ? { eta: eta[1] } : {})
  };
}

export function buildFormatSelector(quality: string, kind: 'audio' | 'video'): string {
  if (kind === 'audio') return 'bestaudio/best';
  if (quality === 'best' || quality === 'bestaudio') return 'bestvideo+bestaudio/best';
  const height = quality.replace(/p$/, '');
  return `bestvideo[height<=${height}]+bestaudio/best`;
}

export function resolveOutputDir(job: Job): string {
  return (
    resolveFolderTokens(job.outputDir.trim(), {
      channelTitle: job.channelTitle,
      playlistTitle: job.playlistTitle
    }) || app.getPath('downloads')
  );
}

// Kandydackie rozszerzenia finalnego pliku mediów, używane do zlokalizowania
// rzeczywistego wyjścia na dysku, gdy destination sparsowany ze stdout yt-dlp jest niedostępny.
export function outputExtensions(job: Job): string[] {
  if (job.kind === 'video') return [`.${job.videoContainer || 'mp4'}`];
  if (job.format === 'best') return [...AUDIO_EXTS, '.webm'];
  return [`.${job.format || 'mp3'}`];
}

export { formatBytes } from '../../shared/formatBytes';

export function formatEta(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

export function sanitizeFileName(name: string): string {
  return sanitizeFilenameSpaced(name);
}

export function deriveHttpFileName(job: Job): string {
  const base = sanitizeFileName(job.title || 'download');
  try {
    const ext = extname(new URL(job.url).pathname).toLowerCase();
    if (ext && ext.length <= 10) return `${base}${ext}`;
  } catch {
    // to nie URL — przechodzi dalej
  }
  return `${base}.bin`;
}
