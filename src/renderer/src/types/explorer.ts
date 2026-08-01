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

export type ViewMode = 'extraSmall' | 'small' | 'medium' | 'large' | 'extraLarge' | 'details';
export type SortBy = 'name' | 'size' | 'modified' | 'type';
export type SortOrder = 'asc' | 'desc';

export interface ExplorerTab {
  id: string;
  path: string;
  label: string;
}

export const VIEW_MODES: ViewMode[] = [
  'extraSmall',
  'small',
  'medium',
  'large',
  'extraLarge',
  'details'
];
