import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  player: null as any,
  settings: { playback: { playbackSpeed: 1.25 } },
  open: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));
vi.mock('../useContextMenu', () => ({ useContextMenu: () => ({ open: h.open }) }));

import { usePlayerContextMenu } from '../usePlayerContextMenu';

type Def = {
  label: string;
  checked?: boolean;
  separator?: boolean;
  action?: () => void;
  children?: Def[];
};

function defs(): Def[] {
  return h.open.mock.calls.at(-1)![1] as Def[];
}

const event = {} as MouseEvent;

function videoContext() {
  return {
    vp: { togglePiP: vi.fn() },
    setSpeed: vi.fn(),
    currentSpeed: 1
  };
}

beforeEach(() => {
  h.player = reactive({
    isPlaying: true,
    isMuted: false,
    subtitleTracks: [
      { id: 'en', label: 'English', language: 'en' },
      { id: 'pl', label: '', language: 'pl' },
      { id: 'raw', label: '', language: '' }
    ],
    activeSubtitleId: 'en' as string | null,
    togglePlay: vi.fn(),
    toggleMute: vi.fn(),
    setActiveSubtitle: vi.fn()
  });
  h.open.mockClear();
  h.t.mockClear();
});

describe('video menu', () => {
  it('opens with playback, mute, PiP, subtitles and speed entries', () => {
    const { showVideoMenu } = usePlayerContextMenu();
    const ctx = videoContext();

    showVideoMenu(event, ctx as never);

    expect(h.open).toHaveBeenCalledWith(event, expect.any(Array), ctx);
    const items = defs();
    expect(items.map((def) => def.label)).toEqual([
      'common.pause',
      'common.mute',
      'player.pipVideo',
      'player.subtitles',
      'player.speed'
    ]);
  });

  it('reflects pause, unmute and toggles them', () => {
    h.player.isPlaying = false;
    h.player.isMuted = true;
    const { showVideoMenu } = usePlayerContextMenu();
    showVideoMenu(event, videoContext() as never);
    const items = defs();

    expect(items[0].label).toBe('common.play');
    expect(items[1].label).toBe('player.unmute');

    items[0].action!();
    items[1].action!();

    expect(h.player.togglePlay).toHaveBeenCalledTimes(1);
    expect(h.player.toggleMute).toHaveBeenCalledTimes(1);
  });

  it('toggles picture in picture when a player is available', () => {
    const { showVideoMenu } = usePlayerContextMenu();
    const ctx = videoContext();
    showVideoMenu(event, ctx as never);

    defs()[2].action!();

    expect(ctx.vp.togglePiP).toHaveBeenCalledTimes(1);
  });

  it('ignores PiP without a video player', () => {
    const { showVideoMenu } = usePlayerContextMenu();
    showVideoMenu(event, { setSpeed: vi.fn(), currentSpeed: 1 } as never);

    expect(() => defs()[2].action!()).not.toThrow();
  });

  it('builds subtitle entries with checks, fallbacks and a toggle', () => {
    const { showVideoMenu } = usePlayerContextMenu();
    showVideoMenu(event, videoContext() as never);
    const subtitles = defs()[3].children!;

    expect(subtitles.map((item) => item.label)).toEqual([
      'player.subtitlesOff',
      '',
      'English',
      'pl',
      'raw'
    ]);
    expect(subtitles[0].checked).toBe(false);
    expect(subtitles[1]).toMatchObject({ separator: true });
    expect(subtitles[2].checked).toBe(true);
    expect(subtitles[3].checked).toBe(false);

    subtitles[2].action!();
    subtitles[3].action!();

    expect(h.player.setActiveSubtitle).toHaveBeenNthCalledWith(1, null);
    expect(h.player.setActiveSubtitle).toHaveBeenNthCalledWith(2, 'pl');
  });

  it('marks subtitles off when none is active and omits the separator without tracks', () => {
    h.player.activeSubtitleId = null;
    h.player.subtitleTracks = [];
    const { showVideoMenu } = usePlayerContextMenu();
    showVideoMenu(event, videoContext() as never);
    const subtitles = defs()[3].children!;

    expect(subtitles).toHaveLength(1);
    expect(subtitles[0].checked).toBe(true);
    subtitles[0].action!();
    expect(h.player.setActiveSubtitle).toHaveBeenCalledWith(null);
  });

  it('marks the active speed and applies the chosen one', () => {
    const { showVideoMenu } = usePlayerContextMenu();
    const ctx = videoContext();
    ctx.currentSpeed = 1.5;
    showVideoMenu(event, ctx as never);
    const speeds = defs()[4].children!;

    expect(speeds.map((def) => def.label)).toEqual(['0.5x', '0.75x', '1x', '1.25x', '1.5x', '2x']);
    expect(speeds.find((def) => def.label === '1.5x')!.checked).toBe(true);
    expect(speeds.filter((def) => def.checked)).toHaveLength(1);

    speeds[0].action!();
    expect(ctx.setSpeed).toHaveBeenCalledWith(0.5);
  });
});

describe('audio menu', () => {
  it('offers playback, mute and speed only', () => {
    const { showAudioMenu } = usePlayerContextMenu();
    const ctx = { setSpeed: vi.fn(), currentSpeed: 1 };
    showAudioMenu(event, ctx);

    expect(defs().map((def) => def.label)).toEqual(['common.pause', 'common.mute', 'player.speed']);
    defs()[0].action!();
    defs()[1].action!();
    defs()[2].children![5].action!();
    expect(h.player.togglePlay).toHaveBeenCalledTimes(1);
    expect(h.player.toggleMute).toHaveBeenCalledTimes(1);
    expect(ctx.setSpeed).toHaveBeenCalledWith(2);
  });
});

describe('defaults', () => {
  it('exposes the configured playback speed', () => {
    const { speed } = usePlayerContextMenu();
    expect(speed).toBe(1.25);
  });
});
