import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';

const state = vi.hoisted(() => ({ player: null as any }));

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));

import SidebarQueuePreview from '../SidebarQueuePreview.vue';

function mountPreview(over: Record<string, unknown> = {}) {
  state.player = reactive({
    queueLength: 0,
    displayQueue: [],
    ...over
  });
  return mount(SidebarQueuePreview, {
    global: { mocks: { $t: (key: string) => key } }
  });
}

beforeEach(() => {
  state.player = null;
});

describe('SidebarQueuePreview', () => {
  it('renders nothing for an empty queue', () => {
    expect(mountPreview().html()).toBe('<!--v-if-->');
  });

  it('shows the queue length and the first five tracks', () => {
    const tracks = Array.from({ length: 7 }, (_, i) => ({
      name: `Track ${i}`,
      metadata: i % 2 ? { title: `Title ${i}` } : undefined
    }));
    const wrapper = mountPreview({ queueLength: 7, displayQueue: tracks });
    const text = wrapper.text();

    expect(text).toContain('nav.queue');
    expect(text).toContain('7');
    expect(text).toContain('Title 1');
    expect(text).toContain('Track 2');
    expect(text).not.toContain('Track 5');
    expect(wrapper.text()).not.toContain('Track 5');
    expect(wrapper.text()).not.toContain('Track 6');
  });
});
