import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const CoverStub = defineComponent({
  name: 'MediaCover',
  props: {
    path: { type: String },
    size: { type: Number },
    fallback: { type: String },
    still: { type: Boolean }
  },
  template: '<div data-testid="cover" />'
});

import HomeMediaCard from '../HomeMediaCard.vue';

function mountCard(props: Record<string, unknown> = {}) {
  return mount(HomeMediaCard, {
    props: { title: 'Title', ...props },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { MediaCover: CoverStub }
    }
  });
}

describe('HomeMediaCard', () => {
  it('plays from the round avatar overlay', async () => {
    const wrapper = mountCard({ round: true });
    const buttons = wrapper.findAll('button');

    await buttons[1].trigger('click');

    expect(wrapper.emitted('play')).toEqual([[]]);
  });

  it('renders the title and optional subtitle', () => {
    const wrapper = mountCard();
    expect(wrapper.text()).toContain('Title');
    expect(wrapper.findAll('div').some((d) => d.text() === '')).toBe(true);

    expect(mountCard({ subtitle: 'Artist' }).text()).toContain('Artist');
  });

  it('passes cover settings', () => {
    const cover = mountCard({
      coverPath: 'D:/a.png',
      coverSize: 64,
      fallback: 'film'
    }).getComponent(CoverStub);

    expect(cover.props()).toMatchObject({
      path: 'D:/a.png',
      size: 64,
      fallback: 'film',
      still: true
    });
  });

  it('shows a badge', () => {
    expect(mountCard({ badge: '12' }).text()).toContain('12');
    expect(mountCard().text()).not.toContain('badge');
  });

  it('plays from the overlay button', async () => {
    const wrapper = mountCard();

    await wrapper.get('button[aria-label="common.play: Title"]').trigger('click');

    expect(wrapper.emitted('play')).toEqual([[]]);
  });

  it('plays from the hover affordance', async () => {
    const wrapper = mountCard();
    const buttons = wrapper.findAll('button');
    await buttons[1].trigger('click');

    expect(wrapper.emitted('play')).toEqual([[]]);
  });

  it('opens the library entry when labelled', async () => {
    const wrapper = mountCard({ openLabel: 'Open in library' });
    const button = wrapper.get('[aria-label="Open in library"]');

    await button.trigger('click');

    expect(wrapper.emitted('open')).toEqual([[]]);
  });

  it('hides the open affordance without a label', () => {
    expect(mountCard().findAll('button')).toHaveLength(2);
  });

  it('uses the round avatar variant', () => {
    const wrapper = mountCard({ round: true, openLabel: 'Open' });

    expect(wrapper.find('.rounded-full').exists()).toBe(true);
    expect(wrapper.find('.aspect-square').classes()).toContain('rounded-full');
  });

  it('stacks collection covers only for square cards', () => {
    const stacked = mountCard({ stacked: true });
    expect(stacked.findAll('.pt-1\\.5').length).toBe(1);

    const round = mountCard({ stacked: true, round: true });
    expect(round.findAll('.pt-1\\.5')).toHaveLength(0);
  });

  it('emits context menu events', async () => {
    const wrapper = mountCard();

    await wrapper.get('article').trigger('contextmenu');

    expect(wrapper.emitted('contextmenu')).toHaveLength(1);
    expect(wrapper.emitted('contextmenu')![0][0]).toBeInstanceOf(MouseEvent);
  });
});
