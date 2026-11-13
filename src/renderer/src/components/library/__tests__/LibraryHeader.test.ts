import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

const state = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  fileCount: vi.fn((count: number) => `${count} files`)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/composables/useCountLabel', () => ({
  useCountLabel: () => ({ fileCount: state.fileCount })
}));

import LibraryHeader from '../LibraryHeader.vue';

function mountHeader(
  props: { totalCount?: number; isScanning?: boolean; showShuffle?: boolean } = {}
) {
  return mount(LibraryHeader, {
    props: { totalCount: 12, isScanning: false, showShuffle: true, ...props }
  });
}

describe('LibraryHeader', () => {
  it('renders the title and formatted count', () => {
    const wrapper = mountHeader();

    expect(wrapper.get('h1').text()).toBe('library.title');
    expect(wrapper.text()).toContain('12 files');
    expect(state.fileCount).toHaveBeenCalledWith(12);
  });

  it('marks the count dot as scanning', () => {
    const idle = mountHeader();
    expect(idle.find('.bg-success').exists()).toBe(false);

    const scanning = mountHeader({ isScanning: true });
    expect(scanning.find('.bg-success.animate-pulse').exists()).toBe(true);
  });

  it('spins the rescan icon while scanning', () => {
    expect(mountHeader().find('.animate-spin').exists()).toBe(false);
    expect(mountHeader({ isScanning: true }).find('.animate-spin').exists()).toBe(true);
  });

  it('hides shuffle unless requested', () => {
    expect(mountHeader({ showShuffle: false }).find('[title="library.shuffleAll"]').exists()).toBe(
      false
    );
    expect(mountHeader().find('[title="library.shuffleAll"]').exists()).toBe(true);
  });

  it('emits shuffle and rescan', async () => {
    const wrapper = mountHeader();

    await wrapper.get('[title="library.shuffleAll"]').trigger('click');
    await wrapper.get('[title="library.rescan"]').trigger('click');

    expect(wrapper.emitted('shuffle')).toEqual([[]]);
    expect(wrapper.emitted('rescan')).toEqual([[]]);
  });
});
