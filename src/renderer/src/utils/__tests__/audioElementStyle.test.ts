import { describe, expect, it } from 'vitest';

import { elementStyle } from '../audioElementStyle';

type Element = Parameters<typeof elementStyle>[0];

function element(over: Partial<Element> = {}): Element {
  return {
    id: 'cover',
    x: 10,
    y: 20,
    width: 30,
    height: 40,
    layer: 2,
    ...over
  } as Element;
}

describe('elementStyle', () => {
  it('positions the element and applies defaults', () => {
    expect(elementStyle(element(), null)).toEqual({
      left: '10%',
      top: '20%',
      width: '30%',
      height: '40%',
      opacity: '1',
      zIndex: '20'
    });
  });

  it('uses a dragged position only for the matching element', () => {
    expect(elementStyle(element(), { id: 'cover', x: 50, y: 60 })).toMatchObject({
      left: '50%',
      top: '60%'
    });
    expect(elementStyle(element(), { id: 'other', x: 50, y: 60 })).toMatchObject({
      left: '10%',
      top: '20%'
    });
  });

  it('converts opacity and layer values', () => {
    const style = elementStyle(element({ opacity: 40, layer: 0 }), null);

    expect(style.opacity).toBe('0.4');
    expect(style.zIndex).toBe('0');
  });

  it('adds a translucent background with the default opacity', () => {
    const style = elementStyle(element({ bg: true }), null);

    expect(style.backgroundColor).toBe(
      'color-mix(in srgb, var(--color-base-300) 40%, transparent)'
    );
    expect(style.borderRadius).toBe('0.5rem');
  });

  it('honours a custom background opacity', () => {
    const style = elementStyle(element({ bg: true, bgOpacity: 75 }), null);

    expect(style.backgroundColor).toContain('75%');
  });

  it('omits the background when disabled or fully transparent', () => {
    expect(elementStyle(element({ bg: false, bgOpacity: 50 }), null)).not.toHaveProperty(
      'backgroundColor'
    );
    expect(elementStyle(element({ bg: true, bgOpacity: 0 }), null)).not.toHaveProperty(
      'backgroundColor'
    );
  });
});
