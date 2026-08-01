export function toMediaServerUrl(filePath: string): string {
  const base = window.api?.mediaServerUrl || '';
  return `${base}/?path=${encodeURIComponent(filePath.replace(/\\/g, '/'))}`;
}
