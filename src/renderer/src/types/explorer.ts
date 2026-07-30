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

export type ViewMode = 'extraSmall' | 'small' | 'medium' | 'large' | 'extraLarge' | 'details';
export type SortBy = 'name' | 'size' | 'modified' | 'type';
export type SortOrder = 'asc' | 'desc';

export interface ExplorerTab {
  id: string;
  path: string;
  label: string;
}

export const VIEW_MODES: ViewMode[] = ['extraSmall', 'small', 'medium', 'large', 'extraLarge', 'details']; 
export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  extraSmall: 'Extra small icons',
  small: 'Small icons',
  medium: 'Medium icons',
  large: 'Large icons',
  extraLarge: 'Extra large icons',
  details: 'Details'
};
