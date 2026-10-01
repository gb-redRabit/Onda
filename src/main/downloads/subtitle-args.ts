type SubtitleFormat = 'srt' | 'vtt' | 'ass';
type SubtitleMode = 'manual' | 'auto' | 'best';

interface SubtitleArgsInput {
  langs: string;
  format?: SubtitleFormat;
  mode?: SubtitleMode;
  kind: 'audio' | 'video';
  // Gdy true, napisy są muxowane do kontenera (wideo). Dla audio napisy są
  // zapisywane jako osobne pliki sidecar.
  embed: boolean;
}

// Buduje argumenty yt-dlp dla napisów. `mode` wybiera, które źródła zapisać:
// napisy ręczne, automatyczne (ASR) lub oba ("best" — ręczne
// z automatycznym fallbackiem). Niepowodzenia pozostają niekrytyczne przez `--ignore-errors`.
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
