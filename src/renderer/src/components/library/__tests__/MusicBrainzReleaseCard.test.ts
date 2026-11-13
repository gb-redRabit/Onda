import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { MusicbrainzRelease } from '@shared/types/ipc';

import MusicBrainzReleaseCard from '../MusicBrainzReleaseCard.vue';

function mountCard(rel: Partial<MusicbrainzRelease>, props: Record<string, unknown> = {}) {
  return mount(MusicBrainzReleaseCard, {
    props: {
      rel: { id: 'r1', title: 'Album', ...rel } as MusicbrainzRelease,
      selected: false,
      lookingUp: false,
      ...props
    }
  });
}

// Karta wyniku MusicBrainz: okładka z cache, artysta/rok/utwory/kraj z fallbackami
// oraz wskaźnik zaznaczenia vs trwającego wyszukiwania.

describe('MusicBrainzReleaseCard', () => {
  it('renders an artwork thumbnail when one is available', () => {
    const wrapper = mountCard({}, { thumb: 'data:image/png;base64,AA' });

    expect(wrapper.find('img').attributes('src')).toBe('data:image/png;base64,AA');
  });

  it('renders metadata with fallbacks when fields are missing', () => {
    const wrapper = mountCard({ title: 'Mystery' });
    const text = wrapper.text();

    expect(text).toContain('Mystery');
    expect(text).toContain('?');
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('prefers the credited artist name', () => {
    const direct = mountCard({ 'artist-credit': [{ name: 'Direct' }, { name: 'Other' }] });
    expect(direct.text()).toContain('Direct');

    const nested = mountCard({ 'artist-credit': [{ artist: { name: 'Nested' } }] });
    expect(nested.text()).toContain('Nested');
  });

  it('shows date, track count and country', () => {
    const wrapper = mountCard({ date: '1999-05-01', 'track-count': 12, country: 'PL' });
    const text = wrapper.text();

    expect(text).toContain('1999-05-01');
    expect(text).toContain('12');
    expect(text).toContain('PL');
  });

  it('marks the selected release with a check', () => {
    const wrapper = mountCard({}, { selected: true });

    expect(wrapper.html()).toContain('lucide-check');
    expect(wrapper.html()).not.toContain('animate-spin');
  });

  it('shows a spinner instead of the check while looking up', () => {
    const wrapper = mountCard({}, { selected: true, lookingUp: true });

    expect(wrapper.html()).toContain('animate-spin');
    expect(wrapper.html()).not.toContain('lucide-check');
  });

  it('emits select when clicked', async () => {
    const wrapper = mountCard({});

    await wrapper.trigger('click');

    expect(wrapper.emitted('select')).toHaveLength(1);
  });
});
