import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import SmartPlaylistDialog from '../SmartPlaylistDialog.vue';

const state = vi.hoisted(() => ({
  library: null as any,
  player: null as any,
  ensureFavorites: vi.fn(async () => undefined),
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params && 'count' in params ? `${key}:${params.count}` : key
  )
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/player', () => ({
  usePlayerStore: () => ({
    ensureFavorites: state.ensureFavorites,
    favorites: state.player.favorites
  })
}));

const ModalShellStub = {
  props: ['visible', 'labelledBy', 'backdrop', 'panelClass'],
  emits: ['close', 'escape'],
  template: '<div><slot /></div>'
};

let wrapper: VueWrapper | null = null;

function track(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    name: 'Song.mp3',
    path: 'C:\\music\\Song.mp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1000,
    type: 'audio',
    metadata: {
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      genre: 'Jazz',
      year: 2000,
      lossless: true
    },
    hasCover: true,
    addedAt: 1_700_000_000_000,
    playCount: 3,
    ...overrides
  } as never;
}

function playlist(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pl1',
    name: 'My playlist',
    match: 'any',
    rules: [{ field: 'year', operator: 'gte', value: 1990 }],
    sort: 'year',
    sortDir: 'asc',
    limit: 50,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  } as never;
}

function mountDialog(props: Record<string, unknown> = {}) {
  wrapper = mount(SmartPlaylistDialog, {
    props,
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { ModalShell: ModalShellStub }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

function ruleRows() {
  return wrapper!.findAll('[data-testid="smart-rule-row"]');
}

function ruleRow(index = 0) {
  return ruleRows()[index];
}

function selectValue(select: Omit<DOMWrapper<Element>, 'exists'>, value: string) {
  (select.element as HTMLSelectElement).value = value;
  return select.trigger('change');
}

function typeValue(input: Omit<DOMWrapper<Element>, 'exists'>, value: string) {
  (input.element as HTMLInputElement).value = value;
  return input.trigger('input');
}

function saveButton() {
  return wrapper!.get('[data-testid="smart-playlist-save"]');
}

beforeEach(() => {
  state.library = reactive({
    tracks: [track(), track({ id: 't2', path: 'C:\\music\\Rock.mp3', metadata: { genre: 'Rock' } })]
  });
  state.player = { favorites: ['C:\\music\\Song.mp3'] };
  state.ensureFavorites.mockClear();
  state.t.mockClear();
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('defaults and edit mode', () => {
  it('starts with a create title, a genre rule and a live preview', async () => {
    mountDialog();
    await flush();

    expect(state.ensureFavorites).toHaveBeenCalled();
    expect(wrapper!.text()).toContain('library.smartPlaylists.createTitle');
    expect(wrapper!.text()).toContain('library.smartPlaylists.preview:2');

    const row = ruleRow();
    expect(row).toBeTruthy();
    expect((row.find('select').element as HTMLSelectElement).value).toBe('genre');
    expect(row.findAll('input')).toHaveLength(1);
    expect(saveButton().attributes('disabled')).toBeDefined();
  });

  it('prefills every field from an existing playlist', async () => {
    mountDialog({ playlist: playlist() });
    await flush();

    expect(wrapper!.text()).toContain('library.smartPlaylists.editTitle');
    expect(
      (wrapper!.get('[data-testid="smart-playlist-name"]').element as HTMLInputElement).value
    ).toBe('My playlist');

    const row = ruleRow();
    const selects = row.findAll('select');
    expect((selects[0].element as HTMLSelectElement).value).toBe('year');
    expect((selects[1].element as HTMLSelectElement).value).toBe('gte');
    expect((row.find('input').element as HTMLInputElement).value).toBe('1990');
    expect(saveButton().attributes('disabled')).toBeUndefined();
  });

  it('saves a trimmed payload and omits an empty sort', async () => {
    mountDialog({ playlist: playlist({ sort: undefined, limit: 0 }) });
    await flush();

    await typeValue(wrapper!.get('[data-testid="smart-playlist-name"]'), '  Renamed  ');
    await saveButton().trigger('click');

    expect(wrapper!.emitted('save')?.[0]?.[0]).toEqual({
      name: 'Renamed',
      match: 'any',
      rules: [{ field: 'year', operator: 'gte', value: 1990 }],
      sort: undefined,
      sortDir: 'asc',
      limit: 0
    });
  });

  it('does not save when the name is blank', async () => {
    mountDialog();
    await flush();

    await typeValue(wrapper!.get('[data-testid="smart-playlist-name"]'), '   ');
    expect(saveButton().attributes('disabled')).toBeDefined();
    await saveButton().trigger('click');
    expect(wrapper!.emitted('save')).toBeUndefined();
  });
});

describe('rules', () => {
  it('resets operator and value when the field changes', async () => {
    mountDialog();
    await flush();

    await selectValue(ruleRow().find('select'), 'title');
    const row = ruleRow();
    expect((row.findAll('select')[1].element as HTMLSelectElement).value).toBe('contains');
    expect((row.find('input').element as HTMLInputElement).value).toBe('');
  });

  it('switches value kinds between text, number, days, between and none', async () => {
    mountDialog();
    await flush();

    // Text input for the default genre rule.
    expect(ruleRow().find('input[type="text"]').exists()).toBe(true);

    await selectValue(ruleRow().find('select'), 'year');
    expect(ruleRow().find('input[type="number"]').exists()).toBe(true);
    expect(ruleRow().text()).not.toContain('library.smartPlaylists.days');

    await selectValue(ruleRow().findAll('select')[1], 'between');
    expect(ruleRow().findAll('input[type="number"]')).toHaveLength(2);

    await selectValue(ruleRow().findAll('select')[1], 'gte');
    expect(ruleRow().findAll('input[type="number"]')).toHaveLength(1);
    expect((ruleRow().find('input').element as HTMLInputElement).value).toBe('0');

    await selectValue(ruleRow().find('select'), 'addedAt');
    expect(ruleRow().find('input[type="number"]').exists()).toBe(true);
    expect(ruleRow().text()).toContain('library.smartPlaylists.days');

    await selectValue(ruleRow().find('select'), 'lastPlayed');
    await selectValue(ruleRow().findAll('select')[1], 'never');
    expect(ruleRow().find('input').exists()).toBe(false);
    expect(
      ruleRow()
        .findAll('span')
        .some((s) => s.text() === '—')
    ).toBe(true);

    await selectValue(ruleRow().find('select'), 'lossless');
    expect(ruleRow().find('input').exists()).toBe(false);
    expect((ruleRow().findAll('select')[1].element as HTMLSelectElement).value).toBe('isTrue');

    await selectValue(ruleRow().findAll('select')[1], 'isFalse');
    await selectValue(ruleRow().findAll('select')[1], 'isTrue');
    expect(wrapper!.emitted('save')).toBeUndefined();
  });

  it('updates both bounds of a between value', async () => {
    mountDialog({
      playlist: playlist({ rules: [{ field: 'year', operator: 'between', value: [1990, 2010] }] })
    });
    await flush();

    const inputs = ruleRow().findAll('input[type="number"]');
    expect((inputs[0].element as HTMLInputElement).value).toBe('1990');
    expect((inputs[1].element as HTMLInputElement).value).toBe('2010');

    await typeValue(inputs[0], '1980');
    await typeValue(inputs[1], '2020');

    await saveButton().trigger('click');
    expect(wrapper!.emitted('save')?.[0]?.[0]).toMatchObject({
      rules: [{ field: 'year', operator: 'between', value: [1980, 2020] }]
    });
  });

  it('adds and removes rules, disabling save when none remain', async () => {
    mountDialog();
    await flush();

    expect(ruleRows()).toHaveLength(1);
    await wrapper!.get('[data-testid="smart-playlist-add-rule"]').trigger('click');
    expect(ruleRows()).toHaveLength(2);

    const remove = wrapper!.findAll('button[aria-label="library.smartPlaylists.removeRule"]');
    await remove[1].trigger('click');
    expect(ruleRows()).toHaveLength(1);

    await wrapper!.get('[aria-label="library.smartPlaylists.removeRule"]').trigger('click');
    expect(ruleRows()).toHaveLength(0);
    await typeValue(wrapper!.get('[data-testid="smart-playlist-name"]'), 'Named');
    expect(saveButton().attributes('disabled')).toBeDefined();
  });
});

describe('templates and options', () => {
  it('applies a template and derives the name only when empty', async () => {
    mountDialog();
    await flush();

    const template = wrapper!
      .findAll('button')
      .find((b) => b.text() === 'library.smartPlaylists.templates.mostPlayed')!;
    await template.trigger('click');

    const row = ruleRow();
    expect((row.find('select').element as HTMLSelectElement).value).toBe('playCount');
    expect((row.find('input').element as HTMLInputElement).value).toBe('1');
    expect(
      (wrapper!.get('[data-testid="smart-playlist-name"]').element as HTMLInputElement).value
    ).toBe('library.smartPlaylists.templates.mostPlayed');

    await typeValue(wrapper!.get('[data-testid="smart-playlist-name"]'), 'Custom');
    const favorites = wrapper!
      .findAll('button')
      .find((b) => b.text() === 'library.smartPlaylists.templates.favorites')!;
    await favorites.trigger('click');
    expect(
      (wrapper!.get('[data-testid="smart-playlist-name"]').element as HTMLInputElement).value
    ).toBe('Custom');

    await saveButton().trigger('click');
    expect(wrapper!.emitted('save')?.[0]?.[0]).toMatchObject({
      name: 'Custom',
      match: 'all',
      sort: 'title',
      sortDir: 'asc',
      limit: 0,
      rules: [{ field: 'favorite', operator: 'isTrue', value: true }]
    });
  });

  it('applies sort, direction, limit and match selections on save', async () => {
    mountDialog();
    await flush();

    const selects = wrapper!.findAll('select');
    // Last three selects are sort, sort direction and limit.
    await selectValue(selects.at(-3)!, 'artist');
    await selectValue(selects.at(-2)!, 'desc');
    await selectValue(selects.at(-1)!, '50');

    const matchSelect = wrapper!.findAll('select')[0];
    await selectValue(matchSelect, 'any');
    await typeValue(wrapper!.get('[data-testid="smart-playlist-name"]'), 'Mix');

    await saveButton().trigger('click');
    expect(wrapper!.emitted('save')?.[0]?.[0]).toEqual({
      name: 'Mix',
      match: 'any',
      rules: [{ field: 'genre', operator: 'contains', value: '' }],
      sort: 'artist',
      sortDir: 'desc',
      limit: 50
    });
  });

  it('recounts the preview as rule values change', async () => {
    mountDialog();
    await flush();
    expect(wrapper!.get('[data-testid="smart-playlist-preview"]').text()).toContain('preview:2');

    await typeValue(ruleRow().find('input'), 'Jazz');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.get('[data-testid="smart-playlist-preview"]').text()).toContain('preview:1');

    await typeValue(ruleRow().find('input'), 'Rock');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.get('[data-testid="smart-playlist-preview"]').text()).toContain('preview:1');
  });
});

describe('closing', () => {
  it('emits cancel from the cancel button and the header close button', async () => {
    mountDialog();
    await flush();

    await wrapper!
      .findAll('button')
      .find((b) => b.text() === 'common.cancel')!
      .trigger('click');
    expect(wrapper!.emitted('cancel')).toHaveLength(1);

    await wrapper!.get('button[aria-label="common.close"]').trigger('click');
    expect(wrapper!.emitted('cancel')).toHaveLength(2);
  });

  it('emits cancel when the modal requests close or escape', async () => {
    mountDialog();
    await flush();

    wrapper!.findComponent(ModalShellStub).vm.$emit('close');
    wrapper!.findComponent(ModalShellStub).vm.$emit('escape');
    await wrapper!.vm.$nextTick();

    expect(wrapper!.emitted('cancel')).toHaveLength(2);
  });
});
