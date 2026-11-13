import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const FolderStub = defineComponent({
  name: 'OutputFolderSection',
  props: {
    channelTitle: { type: String },
    playlistTitle: { type: String },
    channelFolder: { type: String },
    playlistFolder: { type: String },
    folderMode: { type: String },
    outputDir: { type: String }
  },
  emits: ['update:folderMode', 'update:outputDir'],
  template: '<div data-testid="folder" />'
});

import DownloadOutputSection from '../DownloadOutputSection.vue';

function mountSection(over: Record<string, unknown> = {}) {
  return mount(DownloadOutputSection, {
    props: {
      channelFolder: 'Chan',
      playlistFolder: 'Pl',
      folderMode: 'global',
      outputDir: '/out',
      ...over
    },
    global: { stubs: { OutputFolderSection: FolderStub } }
  });
}

describe('DownloadOutputSection', () => {
  it('hides the folder section without channel or playlist titles', () => {
    const wrapper = mountSection();

    expect(wrapper.find('[data-testid="folder"]').exists()).toBe(false);
  });

  it('renders for a channel and forwards props', () => {
    const wrapper = mountSection({ channelTitle: 'Channel' });
    const folder = wrapper.getComponent(FolderStub);

    expect(folder.props()).toMatchObject({
      channelTitle: 'Channel',
      playlistTitle: undefined,
      channelFolder: 'Chan',
      playlistFolder: 'Pl',
      folderMode: 'global',
      outputDir: '/out'
    });
  });

  it('renders for a playlist', () => {
    const wrapper = mountSection({ playlistTitle: 'Playlist' });

    expect(wrapper.getComponent(FolderStub).props('playlistTitle')).toBe('Playlist');
  });

  it('propagates model updates', async () => {
    const wrapper = mountSection({ channelTitle: 'Channel' });
    const folder = wrapper.getComponent(FolderStub);

    folder.vm.$emit('update:folderMode', 'custom');
    folder.vm.$emit('update:outputDir', '/custom');

    expect(wrapper.emitted('update:folderMode')).toEqual([['custom']]);
    expect(wrapper.emitted('update:outputDir')).toEqual([['/custom']]);
  });
});
