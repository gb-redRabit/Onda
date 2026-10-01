import type { DepToolStatus } from '@shared/types/ipc';

export type DepToolName = 'ffmpeg' | 'ffprobe' | 'yt-dlp' | 'mkvextract';

// Narzędzia, bez których Onda nie może działać poprawnie: FFmpeg wykonuje każdy
// transcode, ekstrakcję klatek i remux strumienia, FFprobe każdą sondę czasu trwania /
// napisów. yt-dlp i mkvextract obsługują tylko pobierania online i ekstrakcję czcionek MKV,
// więc brak jednego z nich jest zgłaszany jako opcjonalny problem (ten sam podział
// "brakujące vs wymagane", którego resolver zależności używa w czasie działania).
const REQUIRED_TOOLS: readonly DepToolName[] = ['ffmpeg', 'ffprobe'];

export interface DependencyStatusEntry {
  tool: DepToolName;
  name: string;
  status: DepToolStatus;
}

export interface DependencyIssue {
  tool: DepToolName;
  name: string;
  /** Brakujące/uszkodzone narzędzie potrzebne aplikacji do podstawowego odtwarzania. */
  required: boolean;
  /** Obecne, ale sonda wersji zawiodła (resolver oznacza je jako "broken"). */
  broken: boolean;
}

// Brakujące lub uszkodzone zależności, wymagane najpierw (stabilnie w obrębie grupy).
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
