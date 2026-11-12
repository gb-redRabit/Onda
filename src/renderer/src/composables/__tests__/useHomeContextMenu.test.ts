import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  player: { setTrack: vi.fn(), play: vi.fn(), addToQueue: vi.fn() },
  library: { clearRecent: vi.fn() },
  settings: { home: { sections: [] as string[] }, updateHome: vi.fn() },
  ui: { notify: vi.fn() },
  open: vi.fn(),
  order: ['recent', 'favorites', 'shelves'] as string[],
  toggle: vi.fn((sections: string[], id: string) =>
    sections.includes(id) ? sections.filter((s) => s !== id) : [...sections, id]
  )
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => h.library }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => h.ui }));
vi.mock('@renderer/utils/homeSections', () => ({
  HOME_SECTION_ORDER: h.order,
  toggleHomeSection: h.toggle
}));
vi.mock('../useContextMenu', () => ({ useContextMenu: () => ({ open: h.open }) }));

import { useHomeContextMenu } from '../useHomeContextMenu';
import type { MediaFile } from '@renderer/types/media';

function track(): MediaFile {
  return {
    id: 't1',
    name: 'Song',
    path: 'D:/music/song.mp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    addedAt: 0,
    playCount: 0
  };
}

type Action = { label: string; action?: (ctx: never) => void; separator?: boolean };

function menuDefinitions(): Action[] {
  return h.open.mock.calls.at(-1)![1] as Action[];
}

const event = {} as MouseEvent;

beforeEach(() => {
  vi.clearAllMocks();
  h.settings.home.sections = [];
  h.settings.updateHome.mockImplementation(() => undefined);
});

describe('recent track menu', () => {
  it('opens with track-specific actions', () => {
    const { showRecentMenu } = useHomeContextMenu();
    const item = track();

    showRecentMenu(event, item);

    expect(h.open).toHaveBeenCalledWith(event, expect.any(Array), { track: item });
    const defs = menuDefinitions();
    expect(defs.map((def) => def.label)).toEqual([
      'common.play',
      'common.addToQueue',
      '',
      'home.removeFromRecent'
    ]);
    expect(defs[2]).toMatchObject({ separator: true });
  });

  it('plays the track and queues it', () => {
    const { showRecentMenu } = useHomeContextMenu();
    const item = track();
    showRecentMenu(event, item);
    const [play, queue] = menuDefinitions();

    (play.action as (ctx: { track: MediaFile }) => void)({ track: item });
    (queue.action as (ctx: { track: MediaFile }) => void)({ track: item });

    expect(h.player.setTrack).toHaveBeenCalledWith(item);
    expect(h.player.play).toHaveBeenCalledTimes(1);
    expect(h.player.addToQueue).toHaveBeenCalledWith(item);
  });

  it('removes a recent track and confirms it', () => {
    const { showRecentMenu } = useHomeContextMenu();
    const item = track();
    showRecentMenu(event, item);
    const remove = menuDefinitions()[3];

    (remove.action as (ctx: { track: MediaFile }) => void)({ track: item });

    expect(h.library.clearRecent).toHaveBeenCalledWith('D:/music/song.mp3');
    expect(h.ui.notify).toHaveBeenCalledWith('success', 'home.removedFromRecent');
  });
});

describe('home section menu', () => {
  it('marks visible sections and builds a reset action', () => {
    h.settings.home.sections = ['recent'];
    const { showHomeMenu } = useHomeContextMenu();

    showHomeMenu(event);

    expect(h.open).toHaveBeenCalledWith(event, expect.any(Array), null);
    const defs = menuDefinitions();
    expect(defs.map((def) => def.label)).toEqual([
      expect.stringContaining('home.sections.recent'),
      'home.sections.favorites',
      'home.sections.shelves',
      '',
      'home.resetSections'
    ]);
    expect(defs[0].label).not.toBe('home.sections.recent');
    expect(defs.at(-2)).toMatchObject({ separator: true });
  });

  it('toggles a section when its entry is used', () => {
    h.settings.home.sections = ['recent'];
    const { showHomeMenu } = useHomeContextMenu();
    showHomeMenu(event);

    menuDefinitions()[1].action!(undefined as never);

    expect(h.toggle).toHaveBeenCalledWith(['recent'], 'favorites');
    expect(h.settings.updateHome).toHaveBeenCalledWith({ sections: ['recent', 'favorites'] });
  });

  it('restores all sections from the reset entry', () => {
    const { showHomeMenu } = useHomeContextMenu();
    showHomeMenu(event);

    menuDefinitions().at(-1)!.action!(undefined as never);

    expect(h.settings.updateHome).toHaveBeenCalledWith({ sections: h.order });
    expect(h.settings.updateHome.mock.calls[0][0].sections).not.toBe(h.order);
  });
});
