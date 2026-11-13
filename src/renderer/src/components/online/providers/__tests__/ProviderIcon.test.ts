import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import ProviderIcon from '../ProviderIcon.vue';

function mountIcon(props: { providerId: string; label: string; size?: number }) {
  return mount(ProviderIcon, { props });
}

describe('ProviderIcon', () => {
  it('uses the first letter of the label', () => {
    const wrapper = mountIcon({ providerId: 'pikpak', label: 'PikPak' });

    expect(wrapper.text()).toBe('P');
    expect(wrapper.attributes('aria-hidden')).toBe('true');
  });

  it('trims and uppercases the letter', () => {
    const wrapper = mountIcon({ providerId: 'mega', label: '  mega  ' });

    expect(wrapper.text()).toBe('M');
  });

  it('falls back to a question mark for an empty label', () => {
    expect(mountIcon({ providerId: 'mega', label: '   ' }).text()).toBe('?');
  });

  it('uses the default size and font scaling', () => {
    const style = mountIcon({ providerId: 'pikpak', label: 'P' }).attributes('style');

    expect(style).toContain('width: 18px');
    expect(style).toContain('height: 18px');
    expect(style).toContain('font-size: 10px');
  });

  it('scales a custom size', () => {
    const style = mountIcon({ providerId: 'pikpak', label: 'P', size: 30 }).attributes('style');

    expect(style).toContain('width: 30px');
    expect(style).toContain('font-size: 17px');
  });

  it('maps known providers and falls back for unknown ones', () => {
    expect(mountIcon({ providerId: 'pikpak', label: 'P' }).attributes('style')).toContain(
      'rgb(124, 92, 255)'
    );
    expect(mountIcon({ providerId: 'mega', label: 'M' }).attributes('style')).toContain(
      'rgb(217, 39, 46)'
    );
    expect(mountIcon({ providerId: 'unknown', label: 'U' }).attributes('style')).toContain(
      'rgb(71, 85, 105)'
    );
  });
});
