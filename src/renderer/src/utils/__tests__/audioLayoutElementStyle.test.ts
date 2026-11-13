import { describe, expect, it } from 'vitest';
import type { AudioLayoutElement } from '@renderer/types/settings';
import { layoutEditorStyle } from '../audioLayoutElementStyle';

// Inline style for the audio layout editor; while dragging, the preview position
// wins over the stored one.

function element(over: Partial<AudioLayoutElement> = {}): AudioLayoutElement {
  return {
    x: 10,
    y: 20,
    width: 30,
    height: 40,
    opacity: 80,
    bg: true,
    bgOpacity: 40,
    ...over
  } as AudioLayoutElement;
}

describe('layoutEditorStyle', () => {
  it('uses the stored position and size', () => {
    expect(layoutEditorStyle(element(), false, { x: 1, y: 2 })).toEqual({
      left: '10%',
      top: '20%',
      width: '30%',
      height: '40%',
      opacity: '0.8',
      backgroundColor: 'color-mix(in srgb, var(--color-base-300) 40%, transparent)'
    });
  });

  it('prefers the drag preview while dragging', () => {
    expect(layoutEditorStyle(element(), true, { x: 55, y: 66 })).toMatchObject({
      left: '55%',
      top: '66%'
    });
  });

  it('ignores a missing preview while dragging', () => {
    expect(layoutEditorStyle(element(), true, null)).toMatchObject({ left: '10%', top: '20%' });
  });

  it('defaults opacity and background opacity', () => {
    const style = layoutEditorStyle(
      element({ opacity: undefined, bgOpacity: undefined }),
      false,
      null
    );

    expect(style.opacity).toBe('1');
    expect(style.backgroundColor).toContain('40%');
  });

  it('omits the background when disabled or fully transparent', () => {
    expect(layoutEditorStyle(element({ bg: false }), false, null)).not.toHaveProperty(
      'backgroundColor'
    );
    expect(layoutEditorStyle(element({ bgOpacity: 0 }), false, null)).not.toHaveProperty(
      'backgroundColor'
    );
  });
});
