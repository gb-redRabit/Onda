import type { FileItem, SortBy, SortOrder } from '@renderer/types/explorer';

export function sortFiles(files: FileItem[], sortBy: SortBy, sortOrder: SortOrder): FileItem[] {
  const sorted = [...files].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    let cmp = 0;
    switch (sortBy) {
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'size':
        cmp = a.size - b.size;
        break;
      case 'modified':
        cmp = a.modifiedAt - b.modifiedAt;
        break;
      case 'type':
        cmp = (a.extension || '').localeCompare(b.extension || '');
        break;
    }
    return sortOrder === 'asc' ? cmp : -cmp;
  });
  return sorted;
}
