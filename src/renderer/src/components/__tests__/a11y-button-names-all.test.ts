import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Rozszerzenie `components/audio/__tests__/a11y-button-names.test.ts` na CAŁY katalog
// komponentów: przyciski tylko z ikoną poza widokiem audio (karty online, biblioteka,
// eksplorator, dialogi) nie miały dostępnej nazwy. Skrypt statyczny — każdy mustache
// liczy się jako tekst, więc flagowane są wyłącznie przyciski, których jedyną treścią
// jest komponent ikony i które nie mają `aria-label`/`aria-labelledby`/`title`.

const COMPONENTS_DIR = join(process.cwd(), 'src/renderer/src/components');

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
      hasName: /aria-label|aria-labelledby|:title|title=/.test(tag),
      textContent
    });
  }
  return buttons;
}

function walkVue(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...walkVue(full));
    } else if (entry.name.endsWith('.vue')) {
      out.push(full);
    }
  }
  return out;
}

describe('all component icon-only buttons are named', () => {
  const files = walkVue(COMPONENTS_DIR);

  it('finds the component files it is meant to check', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files)('%s: every icon-only button has an accessible name', (file) => {
    const unnamed = readButtons(file).filter((b) => !b.hasName && b.textContent === '');
    const rel = file.slice(file.indexOf('components')).replace(/\\/g, '/');
    expect(
      unnamed.map((b) => `${rel}:${b.line} ${b.tag}`),
      `icon-only buttons without aria-label/title in ${rel}`
    ).toEqual([]);
  });
});
