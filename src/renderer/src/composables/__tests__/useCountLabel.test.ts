import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string, params?: object) => `${key}:${JSON.stringify(params ?? {})}`),
  locale: null as any,
  pluralCategory: vi.fn(() => 'one' as string)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t, locale: h.locale }) }));
vi.mock('@renderer/utils/plural', () => ({ pluralCategory: h.pluralCategory }));

import { useCountLabel } from '../useCountLabel';

beforeEach(() => {
  h.t.mockClear();
  h.pluralCategory.mockReset().mockReturnValue('one');
  h.locale = ref('pl');
});

describe('useCountLabel', () => {
  it.each([
    ['one', 'One'],
    ['few', 'Few'],
    ['many', 'Many'],
    ['other', 'Many']
  ])('maps the %s plural category to %s', (category, suffix) => {
    h.pluralCategory.mockReturnValue(category);

    useCountLabel().trackCount(3);

    expect(h.pluralCategory).toHaveBeenCalledWith('pl', 3);
    expect(h.t).toHaveBeenCalledWith(`home.trackCount${suffix}`, { count: 3 });
  });

  it('builds file labels with the current locale', () => {
    h.locale.value = 'en';

    useCountLabel().fileCount(12);

    expect(h.pluralCategory).toHaveBeenCalledWith('en', 12);
    expect(h.t).toHaveBeenCalledWith('library.fileCountOne', { count: 12 });
  });

  it('returns the translated string', () => {
    const result = useCountLabel().trackCount(1);

    expect(result).toBe('home.trackCountOne:{"count":1}');
  });
});
