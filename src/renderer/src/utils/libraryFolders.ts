import { useLibraryStore } from '@renderer/stores/library';

export function isLibraryFolder(path: string): boolean {
  return useLibraryStore().normalizedFolders.has(path.replace(/[\\/]$/, ''));
}
