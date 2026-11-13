import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const ButtonStub = defineComponent({
  name: 'OnlineButton',
  props: {
    variant: { type: String },
    size: { type: String },
    title: { type: String },
    disabled: { type: Boolean }
  },
  emits: ['click'],
  template:
    '<button data-testid="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
});
const BadgeStub = defineComponent({
  name: 'OnlineBadge',
  props: { variant: { type: String }, size: { type: String } },
  template: '<span data-testid="badge" :data-variant="variant"><slot /></span>'
});

import OnlineSourceHeader from '../OnlineSourceHeader.vue';

function mountHeader(props: Record<string, unknown> = {}) {
  return mount(OnlineSourceHeader, {
    props: { kind: 'video', title: 'Clip', ...props },
    global: {
      mocks: {
        $t: (key: string, params?: { count: number }) => (params ? `${key}:${params.count}` : key)
      },
      stubs: { OnlineButton: ButtonStub, OnlineBadge: BadgeStub }
    }
  });
}

describe('OnlineSourceHeader', () => {
  it.each([
    ['playlist', 'amber', 'youtube.kindPlaylist'],
    ['channel', 'green', 'youtube.kindChannel'],
    ['video', 'accent', 'youtube.kindVideo']
  ] as const)('labels the %s kind', (kind, variant, label) => {
    const badge = mountHeader({ kind }).getComponent(BadgeStub);

    expect(badge.props('variant')).toBe(variant);
    expect(badge.text()).toBe(label);
  });

  it('shows the channel and total count', () => {
    const wrapper = mountHeader({ channelTitle: 'Channel', totalItems: 12 });

    expect(wrapper.text()).toContain('Clip');
    expect(wrapper.text()).toContain('Channel');
    expect(wrapper.text()).toContain('youtube.itemsCount:12');
  });

  it('falls back to the loaded count', () => {
    const wrapper = mountHeader({ loadedCount: 4 });

    expect(wrapper.text()).toContain('youtube.itemsCount:4');
    expect(wrapper.text()).not.toContain('Channel');
  });

  it('renders the loading spinner with progress', () => {
    const wrapper = mountHeader({ loading: true, totalItems: 10, loadedCount: 3 });
    const spinner = wrapper.find('.animate-spin');

    expect(spinner.exists()).toBe(true);
    expect(wrapper.text()).toContain('3 / 10');
  });

  it('hides the progress counter without a total', () => {
    const wrapper = mountHeader({ loading: true, loadedCount: 3 });

    expect(wrapper.text()).not.toContain('/');
  });

  it('shows enabled actions and emits their events', async () => {
    const wrapper = mountHeader({
      canPlayAll: true,
      canSave: true,
      canDownloadAll: true
    });
    const buttons = wrapper.findAll('[data-testid="button"]');

    expect(buttons).toHaveLength(4);
    for (const button of buttons) await button.trigger('click');

    expect(wrapper.emitted('playAll')).toEqual([[]]);
    expect(wrapper.emitted('save')).toEqual([[]]);
    expect(wrapper.emitted('downloadAll')).toEqual([[]]);
    expect(wrapper.emitted('clear')).toEqual([[]]);
  });

  it('renders only the clear action by default', () => {
    expect(mountHeader().findAll('[data-testid="button"]')).toHaveLength(1);
  });

  it('reflects the saving and saved states', () => {
    const saving = mountHeader({ canSave: true, saving: true });
    const savingButton = saving.findAll('[data-testid="button"]')[0];

    expect(savingButton.attributes('disabled')).toBe('');
    expect(saving.text()).toContain('saved.savingPlaylist');
    expect(saving.find('.animate-spin').exists()).toBe(true);

    const saved = mountHeader({ canSave: true, saved: true });
    expect(saved.text()).toContain('saved.removePlaylistBtn');

    const unsaved = mountHeader({ canSave: true });
    expect(unsaved.text()).toContain('saved.savePlaylistBtn');
  });

  it('shows the save title', () => {
    const button = mountHeader({ canSave: true }).getComponent(ButtonStub);

    expect(button.props('title')).toBe('saved.savePlaylistBtn');
  });
});
