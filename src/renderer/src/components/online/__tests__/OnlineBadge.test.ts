import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import OnlineBadge from '../OnlineBadge.vue';

const variants = {
  default: 'bg-base-100',
  accent: 'bg-primary/10',
  green: 'bg-success/15',
  amber: 'bg-warning/15',
  red: 'bg-error/15'
} as const;

describe('OnlineBadge', () => {
  it('uses the default variant and small size', () => {
    const badge = mount(OnlineBadge);

    expect(badge.classes()).toContain('bg-base-100');
    expect(badge.classes()).toContain('text-2xs');
  });

  it.each(Object.entries(variants))('applies the %s variant', (variant, cls) => {
    const badge = mount(OnlineBadge, { props: { variant: variant as never } });

    expect(badge.classes()).toContain(cls);
  });

  it('applies the medium size', () => {
    const badge = mount(OnlineBadge, { props: { size: 'md' } });

    expect(badge.classes()).toContain('text-xs');
    expect(badge.classes()).not.toContain('text-2xs');
  });

  it('renders slot content', () => {
    const badge = mount(OnlineBadge, { slots: { default: 'NEW' } });

    expect(badge.text()).toBe('NEW');
    expect(badge.classes()).toContain('rounded-full');
  });
});
