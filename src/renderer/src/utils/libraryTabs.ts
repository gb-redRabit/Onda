import { Disc3, Film, Folder, Images, LayoutDashboard, ListMusic, Mic2, Music2 } from '@lucide/vue';

export type TabId =
  'overview' | 'tracks' | 'video' | 'images' | 'folders' | 'artists' | 'albums' | 'playlists';

export const VALID_TABS: TabId[] = [
  'overview',
  'tracks',
  'video',
  'images',
  'folders',
  'artists',
  'albums',
  'playlists'
];

export function isTabId(v: unknown): v is TabId {
  return typeof v === 'string' && (VALID_TABS as string[]).includes(v);
}

export interface LibraryTabCounts {
  total: number;
  audio: number;
  video: number;
  images: number;
  folders: number;
  artists: number;
  albums: number;
  playlists: number;
}

export function buildLibraryTabs(t: (key: string) => string, c: LibraryTabCounts) {
  return [
    { id: 'overview', label: t('library.overview'), icon: LayoutDashboard, count: c.total },
    { id: 'tracks', label: t('library.tracks'), icon: Music2, count: c.audio },
    { id: 'video', label: t('library.video'), icon: Film, count: c.video },
    { id: 'images', label: t('library.images'), icon: Images, count: c.images },
    { id: 'folders', label: t('library.folders'), icon: Folder, count: c.folders },
    { id: 'artists', label: t('library.artists'), icon: Mic2, count: c.artists },
    { id: 'albums', label: t('library.albums'), icon: Disc3, count: c.albums },
    { id: 'playlists', label: t('library.playlists'), icon: ListMusic, count: c.playlists }
  ] as const;
}

export type LibraryTab = ReturnType<typeof buildLibraryTabs>[number];
