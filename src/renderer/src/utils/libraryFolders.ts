import { useLibraryStore } from '@renderer/stores/library';

export function isLibraryFolder(path: string): boolean {
  const normalized = path.replace(/[\\/]$/, '');
  return useLibraryStore().folders.some((f) => f.replace(/[\\/]$/, '') === normalized);
}
