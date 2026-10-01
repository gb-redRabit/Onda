/**
 * Compact byte formatter (B / KB / MB) shared by the download pipeline and the
 * diagnostics view. The richer file-browser variant with GB/TB and a `< 1 B`
 * case lives in `renderer/utils/formatters.ts` (`formatFileSize`).
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes)} B`;
}
