import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';

const h = vi.hoisted(() => ({
  player: null as any,
  fx: { toggleEqualizer: vi.fn() },
  getPlayerPiPHandler: vi.fn()
}));

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/stores/audioFx', () => ({ useAudioFxStore: () => h.fx }));
vi.mock('@renderer/composables/playerPiPHandler', () => ({
  getPlayerPiPHandler: h.getPlayerPiPHandler
}));

import AppMenuPlaybackDropdown from '../AppMenuPlaybackDropdown.vue';

let wrapper: VueWrapper | null = null;

function mountMenu() {
  wrapper = mount(AppMenuPlaybackDropdown, {
    props: { action: (fn: () => void) => fn() },
    global: {
      mocks: {
        $t: (key: string) => key
      }
    }
  });
  return wrapper;
}

function items() {
  return wrapper!.findAll('[role="menuitem"]');
}

function itemByText(text: string) {
  return items().find((item) => item.text().includes(text))!;
}

beforeEach(() => {
  h.player = reactive({
    isPlaying: true,
    currentTrack: null as { type: string } | null,
    pipActive: false,
    shuffle: true,
    repeat: 'none',
    togglePlay: vi.fn(),
    nextTrack: vi.fn(),
    prevTrack: vi.fn(),
    toggleShuffle: vi.fn(),
    cycleRepeat: vi.fn()
  });
  h.fx.toggleEqualizer.mockClear();
  h.getPlayerPiPHandler.mockReset().mockReturnValue(undefined);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('transport', () => {
  it('renders the pause hint while playing and runs the transport actions', async () => {
    mountMenu();

    expect(itemByText('menu.playPause').text()).toContain('common.pause');
    expect(itemByText('menu.playPause').text()).toContain('menu.playPause');

    await itemByText('menu.playPause').trigger('click');
    await itemByText('menu.nextTrack').trigger('click');
    await itemByText('menu.prevTrack').trigger('click');

    expect(h.player.togglePlay).toHaveBeenCalledTimes(1);
    expect(h.player.nextTrack).toHaveBeenCalledTimes(1);
    expect(h.player.prevTrack).toHaveBeenCalledTimes(1);
  });

  it('shows the play hint while paused', () => {
    h.player.isPlaying = false;
    mountMenu();

    expect(itemByText('menu.playPause').text()).toContain('common.play');
  });

  it('reflects shuffle and repeat state', () => {
    h.player.shuffle = false;
    h.player.repeat = 'one';
    mountMenu();

    expect(itemByText('menu.shuffle').text()).toContain('common.off');
    expect(itemByText('menu.repeat').text()).toContain('player.repeatOne');
  });

  it('toggles shuffle, cycles repeat and opens the equalizer', async () => {
    mountMenu();

    await itemByText('menu.shuffle').trigger('click');
    await itemByText('menu.repeat').trigger('click');
    await itemByText('menu.eq').trigger('click');

    expect(h.player.toggleShuffle).toHaveBeenCalledTimes(1);
    expect(h.player.cycleRepeat).toHaveBeenCalledTimes(1);
    expect(h.fx.toggleEqualizer).toHaveBeenCalledTimes(1);
  });

  it('maps repeat none and all hints', async () => {
    mountMenu();
    expect(itemByText('menu.repeat').text()).toContain('player.repeatNone');

    h.player.repeat = 'all';
    await wrapper!.vm.$nextTick();
    expect(itemByText('menu.repeat').text()).toContain('player.repeatAll');
  });
});

describe('picture in picture', () => {
  it('enters PiP for a video when a handler exists', async () => {
    const handler = vi.fn();
    h.getPlayerPiPHandler.mockReturnValue(handler);
    h.player.currentTrack = { type: 'video' };
    mountMenu();

    const pip = itemByText('menu.picInPic');
    await pip.trigger('click');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('hides the enter-PiP item without a handler or for audio', () => {
    h.player.currentTrack = { type: 'video' };
    mountMenu();
    expect(items().some((item) => item.text().includes('menu.picInPic'))).toBe(false);

    wrapper!.unmount();
    h.getPlayerPiPHandler.mockReturnValue(vi.fn());
    h.player.currentTrack = { type: 'audio' };
    mountMenu();
    expect(items().some((item) => item.text().includes('menu.picInPic'))).toBe(false);
  });

  it('hides the enter-PiP item while PiP is already active', () => {
    h.getPlayerPiPHandler.mockReturnValue(vi.fn());
    h.player.currentTrack = { type: 'video' };
    h.player.pipActive = true;
    mountMenu();

    expect(items().some((item) => item.text().includes('menu.picInPic'))).toBe(false);
  });

  it('offers returning from PiP for an active video', async () => {
    h.player.currentTrack = { type: 'video' };
    h.player.pipActive = true;
    mountMenu();

    const restore = wrapper!.get('[data-testid="menu-return-pip"]');
    expect(restore.text()).toContain('menu.returnFromPip');
    await restore.trigger('click');

    expect(wrapper!.emitted('restorePip')).toHaveLength(1);
    expect(h.getPlayerPiPHandler).not.toHaveBeenCalled();
  });
});
