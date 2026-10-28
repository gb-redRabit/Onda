import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { basename, delimiter, join } from 'path';

export interface FfmpegTools {
  ffmpeg: string;
  ffprobe: string;
}

function toolName(tool: 'ffmpeg' | 'ffprobe'): string {
  return process.platform === 'win32' ? `${tool}.exe` : tool;
}

function pathCandidates(name: string): string[] {
  const candidates: string[] = [];
  if (process.env.APPDATA) {
    candidates.push(join(process.env.APPDATA, 'onda', 'bin', name));
  }
  if (process.platform === 'win32') {
    candidates.push(join(process.env.LOCALAPPDATA ?? '', 'onda', 'bin', name));
  } else if (process.platform === 'darwin') {
    candidates.push(join(homedir(), 'Library', 'Application Support', 'onda', 'bin', name));
  } else {
    candidates.push(
      join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'onda', 'bin', name)
    );
  }

  candidates.push(
    join(process.cwd(), 'resources', 'ffmpeg', `${process.platform}-${process.arch}`, name),
    join(process.cwd(), 'resources', 'ffmpeg', name)
  );

  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir) candidates.push(join(dir, name));
  }
  return candidates;
}

function findTool(tool: 'ffmpeg' | 'ffprobe'): string | null {
  return pathCandidates(toolName(tool)).find((candidate) => existsSync(candidate)) ?? null;
}

/**
 * Znajduje FFmpeg/ffprobe w profilu Onda, `resources/ffmpeg` albo systemowym
 * PATH. Dzięki temu testy narzędzi działają też na czystym CI, a nie tylko na
 * maszynie dewelopera z `%APPDATA%\onda\bin`.
 */
export function findFfmpegTools(): FfmpegTools | null {
  const ffmpeg = findTool('ffmpeg');
  const ffprobe = findTool('ffprobe');
  return ffmpeg && ffprobe ? { ffmpeg, ffprobe } : null;
}

/** Kopiuje obie binarki do świeżego profilu E2E (`<profile>/bin`). */
export function seedFfmpegProfile(profileDir: string, tools: FfmpegTools): void {
  const binDir = join(profileDir, 'bin');
  mkdirSync(binDir, { recursive: true });
  copyFileSync(tools.ffmpeg, join(binDir, basename(tools.ffmpeg)));
  copyFileSync(tools.ffprobe, join(binDir, basename(tools.ffprobe)));
}
