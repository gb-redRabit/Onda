import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

const state = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  locale: null as any,
  open: vi.fn(),
  openAt: vi.fn(),
  remoteSrc: null as any,
  relativeTime: vi.fn(() => '5 min'),
  youtubeUrl: vi.fn((id: string) => `https://youtube.com/channel/${id}`),
  soundcloudUrl: vi.fn((id: string) => `https://soundcloud.com/${id}`),
  invoke: vi.fn()
}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: state.t, locale: state.locale })
}));
vi.mock('@renderer/composables/useContextMenu', () => ({
  useContextMenu: () => ({ open: state.open, openAt: state.openAt })
}));
vi.mock('@renderer/composables/useRemoteImage', () => ({
  useRemoteImage: () => state.remoteSrc
}));
vi.mock('@renderer/utils/relativeTime', () => ({ relativeTime: state.relativeTime }));
vi.mock('@shared/provider', () => ({
  buildYouTubeChannelUrl: state.youtubeUrl,
  buildSoundcloudProfileUrl: state.soundcloudUrl
}));

const ButtonStub = defineComponent({
  name: 'OnlineButtonStub',
  props: { variant: String, size: String, disabled: Boolean, title: String },
  template: '<button :disabled="disabled" :title="title"><slot /></button>'
});
const IconButtonStub = defineComponent({
  name: 'OnlineIconButtonStub',
  props: { disabled: Boolean, title: String },
  template: '<button :disabled="disabled" :title="title"><slot /></button>'
});
const BadgeStub = defineComponent({
  name: 'OnlineBadgeStub',
  props: { variant: String, size: String },
  template: '<span data-testid="badge" :data-variant="variant"><slot /></span>'
});
const SwitchStub = defineComponent({
  name: 'SwitchStub',
  props: { modelValue: Boolean, label: String, size: String, title: String },
  emits: ['update:modelValue'],
  template: '<button data-testid="switch" :data-value="String(modelValue)" />'
});

import OnlineSubscriptionCard from '../OnlineSubscriptionCard.vue';

let wrapper: VueWrapper | null = null;

function sub(overrides: Record<string, unknown> = {}) {
  return {
    channelId: 'UC1',
    channelTitle: 'Channel One',
    platform: 'youtube',
    autoDownload: false,
    pendingCount: 0,
    newArrivals: 0,
    lastChecked: 0,
    channelThumbnail: 'https://img/avatar.jpg',
    ...overrides
  } as never;
}

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(OnlineSubscriptionCard, {
    props: { sub: sub(), ...props },
    global: {
      stubs: {
        OnlineButton: ButtonStub,
        OnlineIconButton: IconButtonStub,
        OnlineBadge: BadgeStub,
        Switch: SwitchStub
      },
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) =>
          params ? `${key}:${JSON.stringify(params)}` : key
      }
    }
  });
  return wrapper;
}

function buttons() {
  return wrapper!.findAll('button');
}

function buttonsByTitle(title: string) {
  return buttons().filter((button) => button.attributes('title') === title);
}

beforeEach(() => {
  state.t.mockClear();
  state.locale = ref('pl');
  state.open.mockReset();
  state.openAt.mockReset();
  state.remoteSrc = ref('https://img/avatar.jpg');
  state.relativeTime.mockClear();
  state.youtubeUrl.mockClear();
  state.soundcloudUrl.mockClear();
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(undefined);
  (window as unknown as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('rendering', () => {
  it('shows platform badges and counts', () => {
    setup({ sub: sub({ pendingCount: 3, newArrivals: 2 }) });

    expect(wrapper!.text()).toContain('Channel One');
    const badges = wrapper!.findAll('[data-testid="badge"]');
    expect(badges[0].attributes('data-variant')).toBe('default');
    expect(badges[0].text()).toBe('YT');
    expect(badges[1].attributes('data-variant')).toBe('green');
    expect(badges[1].text()).toContain('youtube.remainingCount');
    expect(badges[2].attributes('data-variant')).toBe('amber');
    expect(badges[2].text()).toContain('youtube.newCount');
  });

  it('labels SoundCloud subscriptions', () => {
    setup({ sub: sub({ platform: 'soundcloud' }) });
    expect(wrapper!.findAll('[data-testid="badge"]')[0].text()).toBe('SC');
  });

  it('formats the last check time', () => {
    setup({ sub: sub({ lastChecked: 1_700_000_000 }) });

    expect(state.relativeTime).toHaveBeenCalledWith(1_700_000_000, 'pl');
    expect(wrapper!.text()).toContain('youtube.lastChecked');
    expect(wrapper!.text()).toContain('5 min');
  });

  it('shows a placeholder when never checked', () => {
    setup();
    expect(wrapper!.text()).toContain('youtube.notCheckedYet');
    expect(state.relativeTime).not.toHaveBeenCalled();
  });

  it('renders the avatar and falls back after an error', async () => {
    setup();
    expect(wrapper!.get('img').attributes('src')).toBe('https://img/avatar.jpg');
    expect(wrapper!.get('img').attributes('alt')).toBe('Channel One');

    await wrapper!.get('img').trigger('error');
    expect(wrapper!.find('img').exists()).toBe(false);
  });

  it('resets the avatar failure when the channel changes', async () => {
    setup();
    await wrapper!.get('img').trigger('error');

    await wrapper!.setProps({ sub: sub({ channelId: 'UC2' }) });

    expect(wrapper!.find('img').exists()).toBe(true);
  });

  it('shows the placeholder without a remote image', () => {
    state.remoteSrc = ref('');
    setup();
    expect(wrapper!.find('img').exists()).toBe(false);
  });
});

describe('channel actions', () => {
  it('opens the channel from the avatar and title', async () => {
    setup();
    await wrapper!.get('img').element.parentElement!.dispatchEvent(new MouseEvent('click'));
    const title = buttons().find((button) => button.text() === 'Channel One')!;
    await title.trigger('click');

    expect(wrapper!.emitted('openChannel')).toEqual([['UC1'], ['UC1']]);
  });
});

describe('auto download', () => {
  it('reflects the subscription state and toggles it', async () => {
    setup({ sub: sub({ autoDownload: true }) });
    const toggle = wrapper!.getComponent(SwitchStub);
    expect(toggle.props('modelValue')).toBe(true);

    toggle.vm.$emit('update:modelValue', false);
    expect(wrapper!.emitted('toggleAutoDownload')).toEqual([['UC1', false]]);

    await wrapper!.setProps({ sub: sub({ autoDownload: false }) });
    expect(wrapper!.getComponent(SwitchStub).props('modelValue')).toBe(false);
  });
});

describe('download and check buttons', () => {
  it('queues the whole channel', async () => {
    setup();
    const download = buttonsByTitle('youtube.downloadAllTitle')[0];

    await download.trigger('click');

    expect(wrapper!.emitted('downloadAll')).toEqual([
      [expect.objectContaining({ channelId: 'UC1' })]
    ]);
  });

  it('shows a spinner and disables while queuing', () => {
    setup({ isQueuing: () => true });
    const download = buttonsByTitle('youtube.downloadAllTitle')[0];

    expect(download.attributes('disabled')).toBeDefined();
    expect(wrapper!.find('.animate-spin').exists()).toBe(true);
    expect(wrapper!.text()).toContain('youtube.downloading');
  });

  it('checks the channel now and disables during the check', async () => {
    setup({ loadingChannelId: 'UC1' });
    const check = buttonsByTitle('youtube.checkChannelNow')[0];

    expect(check.attributes('disabled')).toBeDefined();
    wrapper!.unmount();
    wrapper = null;
    setup();
    await buttonsByTitle('youtube.checkChannelNow')[0].trigger('click');

    expect(wrapper!.emitted('checkNow')).toEqual([['UC1']]);
  });
});

describe('context menu', () => {
  function openFromActions() {
    buttonsByTitle('common.moreActions')[0].element.dispatchEvent(new MouseEvent('click'));
    return state.openAt.mock.calls[0];
  }

  function menuAction(label: string) {
    const defs = openFromActions()[1];
    return defs.find((entry: any) => entry.label === label);
  }

  it('opens the row menu at the actions button', () => {
    setup();
    const [target, defs, payload] = openFromActions();

    expect(target).toBeInstanceOf(HTMLElement);
    expect(Array.isArray(defs)).toBe(true);
    expect(payload).toMatchObject({ channelId: 'UC1' });
  });

  it('opens the menu from a right click', () => {
    setup();
    wrapper!
      .get('[data-testid="online-subscription-card"]')
      .element.dispatchEvent(new MouseEvent('contextmenu'));

    expect(state.open).toHaveBeenCalledWith(
      expect.any(MouseEvent),
      expect.any(Array),
      expect.objectContaining({ channelId: 'UC1' })
    );
  });

  it('wires every subscription action', () => {
    setup({ sub: sub({ autoDownload: true, platform: 'soundcloud' }) });

    menuAction('ctx.online.openChannel').action(sub());
    expect(wrapper!.emitted('openChannel')).toEqual([['UC1']]);

    menuAction('ctx.online.copyChannelUrl').action(sub());
    expect(state.soundcloudUrl).toHaveBeenCalledWith('UC1');
    expect(state.invoke).toHaveBeenCalledWith('fs:copyPath', 'https://soundcloud.com/UC1');

    menuAction('ctx.online.checkNow').action(sub());
    expect(wrapper!.emitted('checkNow')).toEqual([['UC1']]);

    menuAction('ctx.online.downloadAll').action(sub({ channelId: 'UC9' }));
    expect(wrapper!.emitted('downloadAll')).toHaveLength(1);

    menuAction('✓ youtube.autoDownload').action(sub({ autoDownload: true }));
    expect(wrapper!.emitted('toggleAutoDownload')).toEqual([['UC1', false]]);

    menuAction('ctx.online.prefs').action(sub());
    expect(wrapper!.emitted('openPrefs')).toHaveLength(1);

    menuAction('ctx.online.unfollow').action(sub());
    expect(wrapper!.emitted('unfollow')).toEqual([['UC1']]);
  });

  it('uses the YouTube URL for YouTube subscriptions', () => {
    setup();
    const defs = openFromActions()[1];
    defs.find((entry: any) => entry.label === 'ctx.online.copyChannelUrl').action(sub());

    expect(state.youtubeUrl).toHaveBeenCalledWith('UC1');
    expect(state.invoke).toHaveBeenCalledWith('fs:copyPath', 'https://youtube.com/channel/UC1');
  });

  it('disables check and download actions when busy', () => {
    setup({
      loadingChannelId: 'UC1',
      isQueuing: (id: string) => id === 'UC1'
    });
    const defs = openFromActions()[1];
    const check = defs.find((entry: any) => entry.label === 'ctx.online.checkNow');
    const download = defs.find((entry: any) => entry.label === 'ctx.online.downloadAll');

    expect(check.disabledWhen(sub())).toBe(true);
    expect(check.disabledWhen(sub({ channelId: 'other' }))).toBe(false);
    expect(download.disabledWhen(sub())).toBe(true);
    expect(download.disabledWhen(sub({ channelId: 'other' }))).toBe(false);
  });

  it('keeps separators between action groups', () => {
    setup();
    const defs = openFromActions()[1];
    expect(defs.filter((entry: any) => entry.separator)).toHaveLength(2);
  });

  it('tolerates a missing bridge when copying', () => {
    delete (window as unknown as { api?: unknown }).api;
    setup();
    const defs = openFromActions()[1];

    expect(() =>
      defs.find((entry: any) => entry.label === 'ctx.online.copyChannelUrl').action(sub())
    ).not.toThrow();
  });
});
