import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const EmptyStub = defineComponent({
  name: 'EmptyState',
  props: {
    title: { type: String },
    description: { type: String },
    icon: { type: Object },
    variant: { type: String }
  },
  template: '<div data-testid="empty" :data-title="title" :data-description="description" />'
});

import LibraryTracksEmpty from '../LibraryTracksEmpty.vue';

function mountEmpty(props: { liked?: boolean } = {}) {
  return mount(LibraryTracksEmpty, {
    props,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { EmptyState: EmptyStub }
    }
  });
}

describe('LibraryTracksEmpty', () => {
  it('shows the general empty audio message', () => {
    const empty = mountEmpty().get('[data-testid="empty"]');

    expect(empty.attributes('data-title')).toBe('library.noAudio');
    expect(empty.attributes('data-description')).toBe('library.addFolderHint');
  });

  it('shows the liked-songs empty message', () => {
    const empty = mountEmpty({ liked: true }).get('[data-testid="empty"]');

    expect(empty.attributes('data-title')).toBe('library.likedEmpty');
  });
});
