import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

const mocks = vi.hoisted(() => ({
  build: vi.fn((fields: Record<string, string>) =>
    [fields.artist, fields.title, fields.album, fields.year].filter(Boolean).join(' ')
  )
}));

vi.mock('vue-i18n', () => ({
  t: (key: string) => key,
  useI18n: () => ({ t: (key: string) => key })
}));
vi.mock('@renderer/utils/musicbrainz', () => ({ buildMusicbrainzQuery: mocks.build }));

import MusicBrainzSearchForm from '../MusicBrainzSearchForm.vue';

let wrapper: VueWrapper | null = null;
let models: Record<string, any>;

function mountForm(loading = false) {
  const Host = defineComponent({
    components: { MusicBrainzSearchForm },
    setup() {
      const artist = ref('');
      const title = ref('');
      const album = ref('');
      const year = ref('');
      models = { artist, title, album, year };
      return { artist, title, album, year };
    },
    template: `
      <MusicBrainzSearchForm
        v-model:artist="artist"
        v-model:title="title"
        v-model:album="album"
        v-model:year="year"
        :loading="loading"
      />
    `,
    props: ['loading']
  });
  wrapper = mount(Host, {
    props: { loading },
    global: { mocks: { $t: (key: string) => key } }
  });
  return wrapper;
}

function inputs() {
  return wrapper!.findAll('input');
}

function searchButton() {
  return wrapper!.findAll('button').find((item) => item.text().includes('musicbrainz.search'))!;
}

beforeEach(() => {
  mocks.build.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('rendering', () => {
  it('renders all fields with example placeholders and labels', () => {
    mountForm();

    expect(wrapper!.text()).toContain('musicbrainz.fieldArtist');
    expect(wrapper!.text()).toContain('musicbrainz.fieldTitle');
    expect(wrapper!.text()).toContain('musicbrainz.fieldAlbum');
    expect(wrapper!.text()).toContain('musicbrainz.fieldYear');
    expect(wrapper!.text()).toContain('musicbrainz.emptyFieldsHint');

    expect(inputs().map((input) => input.attributes('placeholder'))).toEqual([
      'musicbrainz.examplePrefixSkillet',
      'musicbrainz.examplePrefixMonster',
      'musicbrainz.examplePrefixAwake',
      'musicbrainz.examplePrefix2009'
    ]);
  });
});

describe('search availability', () => {
  it('disables search while everything is empty', () => {
    mountForm();

    expect(searchButton().attributes('disabled')).toBeDefined();
  });

  it('disables search while loading even with a query', () => {
    mountForm(true);
    models.artist.value = 'Skillet';

    return wrapper!.vm.$nextTick().then(() => {
      expect(searchButton().attributes('disabled')).toBeDefined();
    });
  });

  it('enables search when any field has content', async () => {
    mountForm();

    await inputs()[1].setValue('Monster');

    expect(models.title.value).toBe('Monster');
    expect(mocks.build).toHaveBeenLastCalledWith({
      artist: '',
      title: 'Monster',
      album: '',
      year: ''
    });
    expect(searchButton().attributes('disabled')).toBeUndefined();
  });
});

describe('events', () => {
  it('emits search on Enter from every field', async () => {
    mountForm();

    for (const input of inputs()) {
      await input.trigger('keydown', { key: 'Enter' });
    }

    expect(wrapper!.findComponent(MusicBrainzSearchForm).emitted('search')).toHaveLength(4);
  });

  it('emits search from the button', async () => {
    mountForm();
    models.artist.value = 'Skillet';
    await wrapper!.vm.$nextTick();

    await searchButton().trigger('click');

    expect(wrapper!.findComponent(MusicBrainzSearchForm).emitted('search')).toHaveLength(1);
  });

  it('updates every model', async () => {
    mountForm();

    await inputs()[0].setValue('Artist');
    await inputs()[1].setValue('Title');
    await inputs()[2].setValue('Album');
    await inputs()[3].setValue('2009');

    expect(models).toMatchObject({
      artist: { value: 'Artist' },
      title: { value: 'Title' },
      album: { value: 'Album' },
      year: { value: '2009' }
    });
  });
});
