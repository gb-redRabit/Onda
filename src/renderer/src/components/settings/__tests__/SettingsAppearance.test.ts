import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const h = vi.hoisted(() => ({
  settings: null as any,
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: h.t }) };
});
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));

const GroupStub = defineComponent({
  name: 'SettingsGroup',
  props: { title: { type: String } },
  template: '<section data-testid="group">{{ title }}<slot /></section>'
});
const RowStub = defineComponent({
  name: 'SettingsRow',
  props: {
    label: { type: String },
    description: { type: String },
    path: { type: String },
    anchor: { type: String },
    wide: { type: Boolean }
  },
  template: '<div data-testid="row">{{ label }} {{ description }}<slot /></div>'
});
const GridStub = defineComponent({
  name: 'SettingsPositionGrid',
  props: {
    modelValue: { type: String },
    options: { type: Array },
    selectedLabel: { type: String }
  },
  emits: ['update:modelValue'],
  template: '<div data-testid="grid" />'
});

import SettingsAppearance from '../SettingsAppearance.vue';

function mountAppearance(over: Record<string, unknown> = {}) {
  h.settings = reactive({
    appearance: {
      fontSize: 14,
      sidebarPosition: 'left',
      showPlaylists: true,
      showAlbums: false,
      sidebarCollapsed: false,
      animations: true,
      ...over
    },
    updateAppearance: vi.fn((patch: Record<string, unknown>) =>
      Object.assign(h.settings.appearance, patch)
    )
  });
  return mount(SettingsAppearance, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        SettingsGroup: GroupStub,
        SettingsRow: RowStub,
        SettingsPositionGrid: GridStub
      }
    }
  });
}

describe('SettingsAppearance', () => {
  it('renders the font size and updates it', async () => {
    const wrapper = mountAppearance();
    const range = wrapper.get('input[type="range"]');

    expect(range.attributes('value')).toBe('14');
    expect(wrapper.text()).toContain('14px');

    await range.setValue('18');

    expect(h.settings.updateAppearance).toHaveBeenCalledWith({ fontSize: 18 });
  });

  it('offers both sidebar positions with icons', () => {
    const wrapper = mountAppearance();
    const grid = wrapper.getComponent(GridStub);
    const options = grid.props('options') as { id: string; label: string; icon: unknown }[];

    expect(options.map((option) => option.id)).toEqual(['left', 'right']);
    expect(options.map((option) => option.label)).toEqual(['settings.left', 'settings.right']);
    expect(options.every((option) => !!option.icon)).toBe(true);
    expect(grid.props()).toMatchObject({ modelValue: 'left', selectedLabel: 'settings.left' });
    expect(h.t).toHaveBeenCalledWith('settings.left');
  });

  it('updates the sidebar position', () => {
    const wrapper = mountAppearance();

    wrapper.getComponent(GridStub).vm.$emit('update:modelValue', 'right');

    expect(h.settings.updateAppearance).toHaveBeenCalledWith({ sidebarPosition: 'right' });
  });

  it('forwards every checkbox', async () => {
    const wrapper = mountAppearance();
    const boxes = wrapper.findAll('input[type="checkbox"]');

    expect(boxes).toHaveLength(4);
    expect(boxes.map((box) => (box.element as HTMLInputElement).checked)).toEqual([
      true,
      false,
      false,
      true
    ]);

    await boxes[0].setValue(false);
    await boxes[1].setValue(true);
    await boxes[2].setValue(true);
    await boxes[3].setValue(false);

    expect(h.settings.updateAppearance).toHaveBeenCalledWith({ showPlaylists: false });
    expect(h.settings.updateAppearance).toHaveBeenCalledWith({ showAlbums: true });
    expect(h.settings.updateAppearance).toHaveBeenCalledWith({ sidebarCollapsed: true });
    expect(h.settings.updateAppearance).toHaveBeenCalledWith({ animations: false });
  });
});
