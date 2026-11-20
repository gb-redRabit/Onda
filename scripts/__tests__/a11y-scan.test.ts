import { describe, expect, it } from 'vitest';
import {
  buttonHasName,
  controlHasName,
  findTags,
  hasNamedImage,
  scanSource,
  templateOf,
  visibleText
} from '../lib/a11y-scan.mjs';

describe('findTags', () => {
  it('keeps attributes that contain a greater-than sign inside quotes', () => {
    const [tag] = findTags('<button :ref="(el) => el.focus()" type="button">', ['button']);

    expect(tag.attrs).toContain('type="button"');
    expect(tag.attrs).toContain('(el) => el.focus()');
  });

  it('marks self-closing tags and skips lookalike element names', () => {
    const tags = findTags('<input /><inputs>', ['input']);

    expect(tags).toHaveLength(1);
    expect(tags[0].selfClosing).toBe(true);
  });
});

describe('templateOf', () => {
  it('returns only the template, without comments or script markup', () => {
    const source = [
      '<script setup lang="ts">',
      'const html = \'<img src="script.png">\';',
      '</script>',
      '',
      '<template>',
      '  <!-- <img src="comment.png"> -->',
      '  <img src="real.png">',
      '</template>'
    ].join('\n');

    const template = templateOf(source);

    expect(template).toContain('real.png');
    expect(template).not.toContain('script.png');
    expect(template).not.toContain('comment.png');
  });

  it('resolves an empty template for a file without one', () => {
    expect(templateOf('<script setup>const a = 1;</script>')).toBe('');
  });
});

describe('visibleText', () => {
  it('treats an interpolation as a label', () => {
    expect(visibleText('<span>{{ t("save") }}</span>')).toBe('x');
  });

  it('ignores markup-only content and entities', () => {
    expect(visibleText('<svg /><IconArrow />&nbsp;')).toBe('');
  });
});

describe('hasNamedImage', () => {
  it('accepts a non-empty alt, static or bound', () => {
    expect(hasNamedImage('<img alt="cover" />')).toBe(true);
    expect(hasNamedImage('<img :alt="track.title" />')).toBe(true);
  });

  it('rejects a decorative empty alt', () => {
    expect(hasNamedImage('<img alt="" />')).toBe(false);
  });
});

describe('buttonHasName', () => {
  const iconOnly = '<svg viewBox="0 0 1 1" />';

  it('accepts aria labels, hidden overlays, visible text, titled images and titles', () => {
    expect(buttonHasName(' aria-label="Play"', iconOnly)).toBe(true);
    expect(buttonHasName(' aria-hidden="true"', iconOnly)).toBe(true);
    expect(buttonHasName('', 'Save')).toBe(true);
    expect(buttonHasName('', '<img alt="Cover" />')).toBe(true);
    expect(buttonHasName(' title="Play"', iconOnly)).toBe(true);
  });

  it('rejects an icon-only button without a name', () => {
    expect(buttonHasName(' type="button"', iconOnly)).toBe(false);
  });
});

describe('controlHasName', () => {
  it('accepts a bound wrapper, a UI component path and hidden controls', () => {
    expect(controlHasName('', ' v-bind="attrs"', 0, 'Form.vue')).toBe(true);
    expect(controlHasName('', ' type="text"', 0, 'src/components/ui/Input.vue')).toBe(true);
    expect(controlHasName('', ' type="hidden"', 0, 'Form.vue')).toBe(true);
  });

  it('accepts aria labels, a label with for, a wrapping label and a title', () => {
    expect(controlHasName('', ' aria-label="Search"', 0, 'Form.vue')).toBe(true);
    expect(controlHasName('<label for="q">Search</label>', ' id="q"', 0, 'Form.vue')).toBe(true);
    expect(controlHasName('<label>Search', ' type="text"', 6, 'Form.vue')).toBe(true);
    expect(controlHasName('', ' title="Search"', 0, 'Form.vue')).toBe(true);
  });

  it('rejects a bare control that is neither labelled nor wrapped', () => {
    expect(controlHasName('', ' type="text"', 0, 'Form.vue')).toBe(false);
  });
});

describe('scanSource', () => {
  const source = [
    '<script setup lang="ts">',
    'const html = \'<img src="script.png">\';',
    '</script>',
    '',
    '<template>',
    '  <!-- <img src="comment.png"> -->',
    '  <button>',
    '    <svg />',
    '  </button>',
    '  <button type="button">Save</button>',
    '  <input id="q" />',
    '  <label for="q">Search</label>',
    '  <img src="cover.png">',
    '  <img src="ok.png" alt="ok">',
    '  <div role="dialog" aria-label="Settings"></div>',
    '  <div role="dialog"></div>',
    '</template>'
  ].join('\n');

  it('reports each violation category once', () => {
    const rows = scanSource(source, 'Sample.vue');

    expect(rows.buttons).toHaveLength(1);
    expect(rows.withoutType).toHaveLength(1);
    expect(rows.controls).toHaveLength(0);
    expect(rows.images).toHaveLength(1);
    expect(rows.dialogs).toHaveLength(1);
    for (const row of [...rows.buttons, ...rows.images, ...rows.dialogs]) {
      expect(row.file).toBe('Sample.vue');
      expect(row.line).toBeGreaterThan(0);
    }
  });
});
