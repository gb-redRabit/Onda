import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import SourceCard from '../SourceCard.vue';

const item = {
  id: 'i1',
  title: 'Episode',
  subtitle: 'Sub',
  type: 'video',
  thumbnail: 'thumb.jpg',
  duration: '10:00',
  mediaUrl: 'https://c/a.mp4'
};

function mountCard(over: Record<string, unknown> = {}) {
  return mount(SourceCard, {
    props: { item: item as never, ...over },
    global: { mocks: { $t: (key: string) => key } }
  });
}

describe('SourceCard', () => {
  it('renders the thumbnail, type badge and duration', () => {
    const wrapper = mountCard({ showType: true });

    expect(wrapper.get('img').attributes('src')).toBe('thumb.jpg');
    expect(wrapper.text()).toContain('video');
    expect(wrapper.text()).toContain('10:00');
    expect(wrapper.text()).toContain('Episode');
    expect(wrapper.text()).toContain('Sub');
  });

  it('falls back to the image media url', () => {
    const wrapper = mountCard({
      item: { id: 'x', title: 'X', type: 'image', mediaUrl: 'm.jpg' }
    });

    expect(wrapper.get('img').attributes('src')).toBe('m.jpg');
  });

  it('renders a placeholder for an image without a url', () => {
    const wrapper = mountCard({
      item: { id: 'x', title: 'X', type: 'image' }
    });

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('renders a type placeholder without a thumbnail', () => {
    const wrapper = mountCard({
      item: { id: 'x', title: 'X', type: 'audio' },
      showType: true
    });

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.text()).toContain('audio');
  });

  it('hides the type badge when requested', () => {
    const wrapper = mountCard({ showType: false });

    expect(wrapper.text()).not.toContain('video');
  });

  it('previews on click unless selectable', async () => {
    const wrapper = mountCard();

    await wrapper.get('.group').trigger('click');

    expect(wrapper.emitted('preview')).toEqual([[item]]);
  });

  it('selects in selection mode and shows the checkbox', async () => {
    const wrapper = mountCard({ selectable: true, selected: true });

    expect(wrapper.classes()).toContain('ring-2');
    await wrapper.get('.group').trigger('click');

    expect(wrapper.emitted('select')![0][0]).toMatchObject({ id: 'i1' });
    expect(wrapper.findAll('svg').length).toBeGreaterThan(0);
  });

  it('shows the downloaded badge outside selection mode', () => {
    const wrapper = mountCard({ downloaded: true });

    expect(wrapper.text()).toContain('sources.downloaded');
  });

  it('hides the downloaded badge in selection mode', () => {
    const wrapper = mountCard({ downloaded: true, selectable: true });

    expect(wrapper.text()).not.toContain('sources.downloaded');
  });

  it('offers a download button for downloadable media', async () => {
    const wrapper = mountCard({ downloadable: true });
    const button = wrapper.get('[aria-label="sources.download"]');

    expect(button.attributes('disabled')).toBeUndefined();
    await button.trigger('click');

    expect(wrapper.emitted('download')).toEqual([[item]]);
    expect(wrapper.emitted('preview')).toBeUndefined();
  });

  it('disables download when downloaded or downloading', () => {
    expect(
      mountCard({ downloadable: true, downloaded: true })
        .get('[aria-label="sources.downloaded"]')
        .attributes('disabled')
    ).toBe('');
    expect(
      mountCard({ downloadable: true, downloading: true })
        .get('[aria-label="sources.download"]')
        .attributes('disabled')
    ).toBe('');
  });

  it('hides download without media urls', () => {
    const wrapper = mountCard({
      downloadable: true,
      item: { id: 'x', title: 'X', type: 'video' }
    });

    expect(wrapper.find('[aria-label="sources.download"]').exists()).toBe(false);
  });

  it('falls back to an untitled label', () => {
    expect(mountCard({ item: { id: 'x', type: 'video', title: '' } }).text()).toContain(
      'sources.untitled'
    );
  });
});
