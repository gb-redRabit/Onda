import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Oba są kontrolkami tylko dla wskaźnika: div z handlerem mousedown, który
// przewija wartość. Czytnik ekranu w ogóle ich nie widzi, a użytkownik klawiatury
// nie może do nich dotrzeć, więc pozycja odtwarzania i każde pasmo korektora były przesuwane
// tylko myszą i niczym innym. Samo `role="slider"` nie wystarcza — kontrolka
// musi być fokusowalna i faktycznie reagować na klawisze, inaczej rola
// ogłasza jedynie martwy element.

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

  // Wartości atrybutów w cudzysłowach są konsumowane jawnie, bo `>` w jednej z nich
  // (`:aria-valuetext="... ${x > 0} ..."`) inaczej zakończyłby tag wcześniej i
  // ukrył same atrybuty, które są sprawdzane.
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
      // aria-valuenow to jedyny sposób, w jaki czytnik ekranu może zgłosić bieżącą
      // wartość, a bez dostępnej nazwy suwak jest ogłaszany jako goły.
      expect(s.tag, `${s.file}:${s.line} has no aria-valuenow`).toMatch(/aria-valuenow=/);
      expect(s.tag, `${s.file}:${s.line} has no aria-label`).toMatch(/:?aria-label=/);
    }
  });

  it.each(TARGETS)('$label: the key handler reaches the value', ({ file }) => {
    const { script } = readDragSurfaces(file);
    const handler = script.match(/function on\w*Key\([\s\S]*?\n}/)?.[0];
    expect(handler, `no on*Key handler found in ${file}`).toBeDefined();
    // Klawisze strzałek to minimum, na które suwak musi odpowiadać; Page/Home/End to
    // grube ruchy, które czynią długi utwór użytecznym bez 200 naciśnięć.
    expect(handler, `${file} key handler ignores arrow keys`).toMatch(/ArrowUp|ArrowRight/);
    expect(handler, `${file} key handler ignores Page keys`).toMatch(/PageUp|PageDown/);
    expect(handler, `${file} key handler ignores Home/End`).toMatch(/Home/);
  });
});
