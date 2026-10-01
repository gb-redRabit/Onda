/**
 * Kompaktowy formater bajtów (B / KB / MB) współdzielony przez potok pobierania
 * oraz widok diagnostyki. Bogatszy wariant przeglądarki plików z GB/TB i
 * przypadkiem `< 1 B` jest w `renderer/utils/formatters.ts` (`formatFileSize`).
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes)} B`;
}
