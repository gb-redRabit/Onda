import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every icon-only control in the audio view used to be an unlabelled <button>:
// the transport row, mute, the equalizer and queue toggles. A screen reader
// announced them all as just "button", so the transport was unusable without
// sight of the icons. Buttons with visible text get their name from content and
// are exempt — this only checks the ones that have nothing but an icon.

const AUDIO_DIR = join(process.cwd(), 'src/renderer/src/components/audio');

interface ButtonOpeningTag {
  line: number;
  tag: string;
  hasName: boolean;
  textContent: string;
}

function readButtons(file: string): ButtonOpeningTag[] {
  const source = readFileSync(file, 'utf8');
  const buttons: ButtonOpeningTag[] = [];
  const openTag = /<button\b[^>]*>/g;

  for (let match = openTag.exec(source); match !== null; match = openTag.exec(source)) {
    const tag = match[0];
    const line = source.slice(0, match.index).split('\n').length;
    // Content up to the matching </button>, ignoring nested tags. Any mustache
    // counts as rendered text — what a binding produces is a runtime question,
    // not a static-source defect, and the transport buttons this guards contain
    // nothing but an icon component.
    const close = source.indexOf('</button>', match.index);
    const body = close === -1 ? '' : source.slice(match.index + tag.length, close);
    const textContent = body
      .replace(/\{\{[\s\S]*?\}\}/g, ' TEXT ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    buttons.push({
      line,
      tag: tag.replace(/\s+/g, ' '),
      hasName: /aria-label|:title|title=/.test(tag),
      textContent
    });
  }
  return buttons;
}

describe('audio view controls are named', () => {
  const files = readdirSync(AUDIO_DIR).filter((f) => f.endsWith('.vue'));

  it('finds the component files it is meant to check', () => {
    expect(files).toContain('AudioControlsCompact.vue');
    expect(files).toContain('AudioHudToolbar.vue');
  });

  it.each(files)('%s: every icon-only button has an accessible name', (file) => {
    const unnamed = readButtons(join(AUDIO_DIR, file)).filter(
      (b) => !b.hasName && b.textContent === ''
    );
    expect(
      unnamed.map((b) => `${file}:${b.line} ${b.tag}`),
      `icon-only buttons without aria-label or title in ${file}`
    ).toEqual([]);
  });
});
