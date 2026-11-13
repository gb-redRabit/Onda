import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import YtEmbedPlayer from '../YtEmbedPlayer.vue';

function mountPlayer(props: Record<string, unknown> = {}) {
  return mount(YtEmbedPlayer, {
    props: { videoId: 'abc 123', ...props },
    global: { mocks: { $t: (key: string) => key } }
  });
}

describe('YtEmbedPlayer', () => {
  it('builds the embed url and title fallback', () => {
    const iframe = mountPlayer().get('iframe');

    expect(iframe.attributes('src')).toBe(
      'https://www.youtube.com/embed/abc%20123?autoplay=1&playsinline=1&rel=0'
    );
    expect(iframe.attributes('title')).toBe('abc 123');
  });

  it('uses the provided title and renders metadata', () => {
    const wrapper = mountPlayer({ title: 'Video', channelTitle: 'Channel' });

    expect(wrapper.get('iframe').attributes('title')).toBe('Video');
    expect(wrapper.text()).toContain('Video');
    expect(wrapper.text()).toContain('Channel');
  });

  it('hides metadata and actions without a title', () => {
    const wrapper = mountPlayer();

    expect(wrapper.text()).toBe('');
    expect(wrapper.findAll('button')).toHaveLength(0);
  });

  it('omits the channel line when absent', () => {
    const wrapper = mountPlayer({ title: 'Video' });

    expect(wrapper.text()).toContain('Video');
    expect(wrapper.findAll('p')).toHaveLength(1);
  });

  it('opens a window only with a source url', async () => {
    const withUrl = mountPlayer({ title: 'Video', sourceUrl: 'https://youtube.com/watch?v=1' });
    const open = withUrl.findAll('button')[0];

    await open.trigger('click');

    expect(withUrl.emitted('openWindow')).toEqual([['https://youtube.com/watch?v=1']]);

    const withoutUrl = mountPlayer({ title: 'Video' });
    await withoutUrl.findAll('button')[0].trigger('click');
    expect(withoutUrl.emitted('openWindow')).toBeUndefined();
  });

  it('closes the player', async () => {
    const wrapper = mountPlayer({ title: 'Video' });
    const close = wrapper.findAll('button')[1];

    await close.trigger('click');

    expect(wrapper.emitted('close')).toEqual([[]]);
  });
});
