import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Icon-only controls have no text content, so without an accessible name a
// screen reader announces them as just "button". The frameless main window and
// the explorer window both draw their own minimize/maximize/close buttons.

const ROOT = process.cwd();

const FILES = [
  'src/renderer/src/components/layout/AppMenuWindowControls.vue',
  'src/renderer/src/views/ExplorerWindowView.vue'
];

/** Buttons whose entire content is an icon and that carry no aria-label. */
function iconOnlyButtonsWithoutAriaLabel(source: string): string[] {
  const buttons = source.match(/<button[\s\S]*?<\/button>/g) ?? [];
  const offenders: string[] = [];
  for (const button of buttons) {
    const openTag = button.slice(0, button.indexOf('>'));
    const inner = button.slice(button.indexOf('>') + 1, button.lastIndexOf('</button>'));
    const text = inner
      .replace(/<[^>]*>/g, '')
      .replace(/\{\{[^}]*\}\}/g, '')
      .trim();
    if (text === '' && !/aria-label=/.test(openTag)) offenders.push(openTag.trim());
  }
  return offenders;
}

describe('window controls accessibility', () => {
  it.each(FILES)('%s gives every icon-only button an accessible name', (relative) => {
    const source = readFileSync(join(ROOT, relative), 'utf8');
    const offenders = iconOnlyButtonsWithoutAriaLabel(source);
    expect(offenders, `${relative} buttons without aria-label:\n${offenders.join('\n')}`).toEqual(
      []
    );
  });

  it.each(FILES)('%s names the minimize/maximize/close controls', (relative) => {
    const source = readFileSync(join(ROOT, relative), 'utf8');
    for (const key of ['window.minimize', 'window.maximize', 'window.close']) {
      expect(source, `${relative} is missing aria-label for ${key}`).toContain(key);
    }
  });
});
