import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  pickImagePath: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/utils/pickImage', () => ({ pickImagePath: h.pickImagePath }));

import CoverDetailFields from '../CoverDetailFields.vue';

function mountFields(over: Record<string, unknown> = {}) {
  return mount(CoverDetailFields, {
    props: {
      coverType: 'frame',
      frameTime: 12,
      clipStart: 1,
      clipEnd: 6,
      clipFormat: 'webm',
      customPath: '',
      ...over
    }
  });
}

beforeEach(() => {
  h.t.mockClear();
  h.pickImagePath.mockReset();
});

describe('CoverDetailFields', () => {
  it('renders nothing for thumbnail and none', () => {
    expect(mountFields({ coverType: 'thumbnail' }).find('label').exists()).toBe(false);
    expect(mountFields({ coverType: 'none' }).find('label').exists()).toBe(false);
  });

  it('renders the frame time input with integer steps', () => {
    const input = mountFields().get('input[type="number"]');

    expect(input.attributes('value')).toBe('12');
    expect(input.attributes('step')).toBe('1');
    expect(input.attributes('min')).toBe('0');
  });

  it('uses any step when fractional values are allowed', () => {
    const input = mountFields({ stepIntegers: false }).get('input[type="number"]');

    expect(input.attributes('step')).toBe('any');
  });

  it('emits frame time changes', async () => {
    const wrapper = mountFields();

    await wrapper.get('input[type="number"]').setValue('30');

    expect(wrapper.emitted('update:frameTime')).toEqual([[30]]);
  });

  it('renders two clip columns by default', () => {
    const wrapper = mountFields({ coverType: 'clip' });
    const grid = wrapper.get('.grid');

    expect(grid.classes()).toContain('grid-cols-2');
    expect(wrapper.findAll('input[type="number"]')).toHaveLength(2);
    expect(wrapper.get('select').element.parentElement?.classList).toContain('col-span-2');
  });

  it('renders three clip columns with a compact format field', async () => {
    const wrapper = mountFields({ coverType: 'clip', clipColumns: 3 });
    const grid = wrapper.get('.grid');

    expect(grid.classes()).toContain('grid-cols-3');
    expect(wrapper.get('select').element.parentElement?.classList).not.toContain('col-span-2');

    await wrapper.get('select').setValue('mp4');
    expect(wrapper.emitted('update:clipFormat')).toEqual([['mp4']]);
  });

  it('uses any step for clip inputs when fractional values are allowed', () => {
    const wrapper = mountFields({ coverType: 'clip', stepIntegers: false });

    expect(wrapper.findAll('input[type="number"]').map((i) => i.attributes('step'))).toEqual([
      'any',
      'any'
    ]);
  });

  it('emits clip updates', async () => {
    const wrapper = mountFields({ coverType: 'clip' });
    const numbers = wrapper.findAll('input[type="number"]');

    await numbers[0].setValue('3');
    await numbers[1].setValue('9');
    await wrapper.get('select').setValue('mp4');

    expect(wrapper.emitted('update:clipStart')).toEqual([[3]]);
    expect(wrapper.emitted('update:clipEnd')).toEqual([[9]]);
    expect(wrapper.emitted('update:clipFormat')).toEqual([['mp4']]);
  });

  it('shows the custom cover hint and picks a file', async () => {
    h.pickImagePath.mockResolvedValue('D:/cover.png');
    const wrapper = mountFields({ coverType: 'custom' });

    expect(wrapper.text()).toContain('youtube.coverCustomHint');

    await wrapper.get('button').trigger('click');

    expect(h.pickImagePath).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('update:customPath')).toEqual([['D:/cover.png']]);
  });

  it('shows the chosen custom path', () => {
    const wrapper = mountFields({ coverType: 'custom', customPath: 'D:/picked.png' });

    expect(wrapper.text()).toContain('D:/picked.png');
    expect(wrapper.text()).not.toContain('youtube.coverCustomHint');
  });

  it('ignores a cancelled file picker', async () => {
    h.pickImagePath.mockResolvedValue(null);
    const wrapper = mountFields({ coverType: 'custom' });

    await wrapper.get('button').trigger('click');

    expect(wrapper.emitted('update:customPath')).toBeUndefined();
  });
});
