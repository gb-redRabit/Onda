import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string, params?: { count: number }) => (params ? `${key}:${params.count}` : key)
    })
  };
});

const ButtonStub = defineComponent({
  name: 'OnlineButton',
  props: {
    variant: { type: String },
    size: { type: String },
    disabled: { type: Boolean }
  },
  emits: ['click'],
  template:
    '<button data-testid="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
});
const BadgeStub = defineComponent({
  name: 'OnlineBadge',
  props: { variant: { type: String } },
  template: '<span data-testid="badge" :data-variant="variant"><slot /></span>'
});

import OnlineBatchPanel from '../OnlineBatchPanel.vue';

function mountPanel(over: Record<string, unknown> = {}) {
  return mount(OnlineBatchPanel, {
    props: {
      open: true,
      entries: [
        { url: 'https://y/v', kind: 'video' },
        { url: 'https://y/p', kind: 'playlist' },
        { url: 'https://s/c', kind: 'channel' }
      ],
      skippedCount: 2,
      hasSc: false,
      profiles: [
        { id: 'p1', name: 'Profile one' },
        { id: 'p2', name: 'Profile two' }
      ],
      busy: false,
      result: 'done',
      text: 'links',
      profileId: '',
      ...over
    },
    global: { stubs: { OnlineButton: ButtonStub, OnlineBadge: BadgeStub } }
  });
}

describe('OnlineBatchPanel', () => {
  it('hides when closed', () => {
    expect(mountPanel({ open: false }).find('textarea').exists()).toBe(false);
  });

  it('binds text and shows counts', () => {
    const wrapper = mountPanel();
    const textarea = wrapper.get('textarea');

    expect((textarea.element as HTMLTextAreaElement).value).toBe('links');
    expect(wrapper.text()).toContain('youtube.batchDetected:3');
    expect(wrapper.text()).toContain('youtube.batchSkipped:2');
  });

  it('emits text edits', async () => {
    const wrapper = mountPanel();

    await wrapper.get('textarea').setValue('new links');

    expect(wrapper.emitted('update:text')).toEqual([['new links']]);
  });

  it('hides the skipped count at zero', () => {
    expect(mountPanel({ skippedCount: 0 }).text()).not.toContain('youtube.batchSkipped');
  });

  it('lists detected entries with labels and badge variants', () => {
    const wrapper = mountPanel();
    const badges = wrapper.findAll('[data-testid="badge"]');

    expect(badges.map((b) => b.attributes('data-variant'))).toEqual(['accent', 'amber', 'green']);
    expect(badges.map((b) => b.text())).toEqual([
      'youtube.kindVideo',
      'youtube.kindPlaylist',
      'youtube.kindChannel'
    ]);
    expect(wrapper.text()).toContain('https://y/v');
  });

  it('offers profile selection without SoundCloud', () => {
    const wrapper = mountPanel();
    const select = wrapper.get('select');
    const options = select.findAll('option');

    expect(options.map((o) => o.text())).toEqual([
      'youtube.profileNone',
      'Profile one',
      'Profile two'
    ]);
    expect(wrapper.text()).not.toContain('youtube.batchProfilesScHint');
  });

  it('emits profile changes', async () => {
    const wrapper = mountPanel();

    await wrapper.get('select').setValue('p2');

    expect(wrapper.emitted('update:profileId')).toEqual([['p2']]);
  });

  it('shows the SoundCloud profile hint instead of the selector', () => {
    const wrapper = mountPanel({ hasSc: true });

    expect(wrapper.find('select').exists()).toBe(false);
    expect(wrapper.text()).toContain('youtube.batchProfilesScHint');
  });

  it('hides profile controls without profiles', () => {
    const wrapper = mountPanel({ profiles: [] });

    expect(wrapper.find('select').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('youtube.batchProfilesScHint');
  });

  it('emits import and add actions', async () => {
    const wrapper = mountPanel();
    const buttons = wrapper.findAll('[data-testid="button"]');

    await buttons[0].trigger('click');
    await buttons[1].trigger('click');

    expect(wrapper.emitted('importFile')).toEqual([[]]);
    expect(wrapper.emitted('submit')).toEqual([[]]);
  });

  it('disables add without entries or while busy', () => {
    expect(
      mountPanel({ entries: [] }).findAll('[data-testid="button"]')[1].attributes('disabled')
    ).toBe('');
    expect(
      mountPanel({ busy: true }).findAll('[data-testid="button"]')[1].attributes('disabled')
    ).toBe('');
  });

  it('shows the result and hides the entry list when empty', () => {
    expect(mountPanel().text()).toContain('done');
    expect(mountPanel({ result: '' }).text()).not.toContain('done');

    const empty = mountPanel({ entries: [] });
    expect(empty.find('ul').exists()).toBe(false);
    expect(empty.text()).toContain('youtube.batchDetected:0');
  });
});
