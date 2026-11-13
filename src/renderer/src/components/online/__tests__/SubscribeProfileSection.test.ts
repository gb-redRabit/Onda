import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) };
});

import SubscribeProfileSection from '../SubscribeProfileSection.vue';

const profiles = [
  { id: 'p1', name: 'Profile one' },
  { id: 'p2', name: 'Profile two' }
];

function mountSection(over: Record<string, unknown> = {}) {
  return mount(SubscribeProfileSection, {
    props: { isSc: false, profiles, selectedId: 'p1', ...over }
  });
}

describe('SubscribeProfileSection', () => {
  it('hides for SoundCloud', () => {
    expect(mountSection({ isSc: true }).html()).toBe('<!--v-if-->');
  });

  it('renders the section title and options', () => {
    const wrapper = mountSection();
    const options = wrapper.findAll('option');

    expect(wrapper.text()).toContain('youtube.profilesSection');
    expect(options.map((o) => o.text())).toEqual([
      'youtube.profileNone',
      'Profile one',
      'Profile two'
    ]);
    expect(options.map((o) => o.attributes('value'))).toEqual(['', 'p1', 'p2']);
  });

  it('binds the selected profile', () => {
    expect(mountSection().get('select').attributes('value')).toBe('p1');
    expect(mountSection({ selectedId: '' }).get('select').attributes('value')).toBe('');
  });

  it('emits profile changes', async () => {
    const wrapper = mountSection();

    await wrapper.get('select').setValue('p2');

    expect(wrapper.emitted('select')).toEqual([['p2']]);
  });
});
