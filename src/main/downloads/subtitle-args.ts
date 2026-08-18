type SubtitleFormat = 'srt' | 'vtt' | 'ass';
type SubtitleMode = 'manual' | 'auto' | 'best';

interface SubtitleArgsInput {
  langs: string;
  format?: SubtitleFormat;
  mode?: SubtitleMode;
  kind: 'audio' | 'video';
  // When true, subtitles are muxed into the container (video). For audio the
  // subtitles are written as separate sidecar files.
  embed: boolean;
}

// Builds the yt-dlp arguments for subtitles. `mode` selects which sources to
// write: manual subtitles, automatic (ASR) subtitles, or both ("best" — manual
// with automatic fallback). Failures stay non-critical via `--ignore-errors`.
export function buildSubtitleArgs(opts: SubtitleArgsInput): string[] {
  const mode: SubtitleMode = opts.mode ?? 'best';
  const args: string[] = [];
  if (mode === 'manual' || mode === 'best') args.push('--write-subs');
  if (mode === 'auto' || mode === 'best') args.push('--write-auto-subs');
  args.push('--sub-langs', opts.langs);
  args.push('--convert-subs', opts.format ?? 'srt');
  args.push('--ignore-errors');
  if (opts.embed) args.push('--embed-subs');
  return args;
}
