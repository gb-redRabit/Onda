export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
  createdAt: number;
  extension?: string;
  mimeType?: string;
  thumbnail?: string;
}

export interface NavigationState {
  history: string[];
  currentIndex: number;
  currentPath: string;
}

export type ViewMode = 'grid' | 'list';
export type SortBy = 'name' | 'size' | 'modified' | 'type';
export type SortOrder = 'asc' | 'desc';
