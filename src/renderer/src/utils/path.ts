export function isUnderPath(p: string, folder: string): boolean {
  return p === folder || p.startsWith(folder + '/') || p.startsWith(folder + '\\');
}
