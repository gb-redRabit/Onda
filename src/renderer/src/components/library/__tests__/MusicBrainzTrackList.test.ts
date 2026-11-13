import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

const h = vi.hoisted(() => ({
  displayTrackNumber: vi.fn(
    (track: { number?: string; position?: string }, index: number) =>
      track.number ?? track.position ?? String(index + 1)
  )
}));

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) };
});
vi.mock('@renderer/utils/musicbrainz', () => ({
  displayTrackNumber: h.displayTrackNumber
}));

import MusicBrainzTrackList from '../MusicBrainzTrackList.vue';

function mountList(tracks: unknown[]) {
  return mount(MusicBrainzTrackList, { props: { tracks: tracks as never } });
}

describe('MusicBrainzTrackList', () => {
  it('renders nothing without tracks', () => {
    expect(mountList([]).find('div').exists()).toBe(false);
  });

  it('lists tracks with numbers and titles', () => {
    const wrapper = mountList([
      { id: 'a', title: 'First', number: '1' },
      { id: 'b', title: 'Second', position: '2' }
    ]);
    const rows = wrapper.findAll('.flex.items-center');

    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('1');
    expect(rows[0].text()).toContain('First');
    expect(rows[1].text()).toContain('Second');
    expect(h.displayTrackNumber).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), 1);
  });

  it('limits the list to thirty tracks and reports the rest', () => {
    const tracks = Array.from({ length: 35 }, (_, i) => ({
      id: `t${i}`,
      title: `Track ${i}`
    }));
    const wrapper = mountList(tracks);

    expect(wrapper.findAll('.flex.items-center')).toHaveLength(30);
    expect(wrapper.text()).toContain('+ 5 musicbrainz.more');
  });

  it('omits the remainder notice at thirty tracks', () => {
    const tracks = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, title: `Track ${i}` }));
    const wrapper = mountList(tracks);

    expect(wrapper.findAll('.flex.items-center')).toHaveLength(30);
    expect(wrapper.text()).not.toContain('musicbrainz.more');
  });
});
