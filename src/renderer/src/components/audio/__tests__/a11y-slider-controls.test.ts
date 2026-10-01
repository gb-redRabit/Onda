import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Both of these are pointer-only controls: a div with a mousedown handler that
// scrubs a value. A screen reader cannot see them at all, and a keyboard user
// cannot reach them, so playback position and every equalizer band were movable
// with a mouse and nothing else. `role="slider"` alone is not enough — the
// control has to be focusable and actually respond to keys, otherwise the role
// just announces a dead element.

interface DragSurface {
  file: string;
  line: number;
  tag: string;
  script: string;
}

const TARGETS = [
  { file: 'src/renderer/src/components/audio/AudioProgressBar.vue', label: 'playback position' },
  { file: 'src/renderer/src/components/player/Equalizer.vue', label: 'equalizer band' }
];

function readDragSurfaces(relPath: string): { surfaces: DragSurface[]; script: string } {
  const source = readFileSync(join(process.cwd(), relPath), 'utf8');
  const template = source.slice(source.indexOf('<template>'));
  const script = source.slice(0, source.indexOf('<template>'));
  const surfaces: DragSurface[] = [];

  // Quoted attribute values are consumed explicitly, because a `>` inside one
  // (`:aria-valuetext="... ${x > 0} ..."`) would otherwise end the tag early and
  // hide the very attributes being asserted.
  for (const match of template.matchAll(/<div\b(?:[^>"']|"[^"]*"|'[^']*')*>/g)) {
    if (!/@mousedown/.test(match[0])) continue;
    const before = template.slice(0, match.index);
    surfaces.push({
      file: relPath,
      line: before.split('\n').length,
      tag: match[0].replace(/\s+/g, ' '),
      script
    });
  }
  return { surfaces, script };
}

describe('pointer-only value controls are reachable from the keyboard', () => {
  it.each(TARGETS)('$label: the drag surface exists to check', ({ file }) => {
    const { surfaces } = readDragSurfaces(file);
    expect(surfaces.length, `no @mousedown surface found in ${file}`).toBeGreaterThan(0);
  });

  it.each(TARGETS)(
    '$label: drag surface has role=slider, is focusable, and handles keys',
    ({ file }) => {
      const { surfaces } = readDragSurfaces(file);
      const bad = surfaces
        .filter(
          (s) =>
            !/role="slider"/.test(s.tag) || !/tabindex="0"/.test(s.tag) || !/@keydown=/.test(s.tag)
        )
        .map((s) => `${s.file}:${s.line} ${s.tag}`);
      expect(bad, `drag surface missing role/tabindex/keydown in ${file}`).toEqual([]);
    }
  );

  it.each(TARGETS)('$label: exposes its value to assistive tech', ({ file }) => {
    const { surfaces } = readDragSurfaces(file);
    for (const s of surfaces) {
      // aria-valuenow is the only way a screen reader can report the current
      // value, and without an accessible name the slider is announced bare.
      expect(s.tag, `${s.file}:${s.line} has no aria-valuenow`).toMatch(/aria-valuenow=/);
      expect(s.tag, `${s.file}:${s.line} has no aria-label`).toMatch(/:?aria-label=/);
    }
  });

  it.each(TARGETS)('$label: the key handler reaches the value', ({ file }) => {
    const { script } = readDragSurfaces(file);
    const handler = script.match(/function on\w*Key\([\s\S]*?\n}/)?.[0];
    expect(handler, `no on*Key handler found in ${file}`).toBeDefined();
    // Arrow keys are the minimum a slider must answer; Page/Home/End are the
    // coarse movements that make a long track usable without 200 presses.
    expect(handler, `${file} key handler ignores arrow keys`).toMatch(/ArrowUp|ArrowRight/);
    expect(handler, `${file} key handler ignores Page keys`).toMatch(/PageUp|PageDown/);
    expect(handler, `${file} key handler ignores Home/End`).toMatch(/Home/);
  });
});
